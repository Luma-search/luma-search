/**
 * Haupt-Suchroute: GET /search
 */
const router = require('express').Router();
const { searchLimiter } = require('../../config/rate-limiter');
const { loadDatabase, generateRelatedSearches, applyBlacklist, applyWhitelist } = require('../helpers/db-helpers');
const { escapeHtml, sanitizeUrl } = require('../helpers/output-helpers');
const { sanitizeInput } = require('../../config/security-middleware');
const ranking      = require('../../algorithmus/ranking');
const calculator   = require('../../modules/calculator/calculator');
const { convertCurrency } = require('../../modules/currency_converter/currency_converter');
const eventTracker = require('../../modules/event-tracker');
const synonyms     = require('../../modules/synonyms/synonyms');
const spellChecker = require('../../modules/synonyms/spell-checker');
const fuzzy        = require('../../modules/fuzzy/fuzzy');
const votesManager = require('../../data/votes-manager');
const { pool: sessionPool } = require('../../crawler_new/db.js');
const { getUserInterests } = require('../../algorithmus/user-journey');
const pogoTracking = require('../../algorithmus/pogo-tracking');
const redis        = require('../../config/redis');
const trendEngine  = require('../../algorithmus/trend_engine');
const semanticAI   = require('../../algorithmus/intelligence/semantic-intelligence');
const { getKeywordContext } = require('../../algorithmus/intelligence/keyword-boost');
const { findSupportNumber } = require('../../modules/direkt_support_firmen/support_engine');
const { findAcronym }       = require('../../modules/acronyms/acronym_engine');
const { weatherSource }     = require('../../modules/wetter/weatherSource');
const { wattWaechter }      = require('../../modules/watt_waechter/watt-waechter');
const NumeralToWordConverter = require('../../modules/zahl-zu-wort/NumeralToWordConverter');
const HolidayPredictor = require('../../modules/feiertag-countdown/HolidayPredictor');

const PasswordStrengthAnalyzer = require('../../modules/passwort/PasswordStrengthAnalyzer');
const SecurePasswordGenerator = require('../../modules/passwort/SecurePasswordGenerator');
const KeychainManager = require('../../modules/passwort/KeychainManager');

// ── Instanzen ─────────────────────────────────────────────────────────────
const passwordAnalyzer = new PasswordStrengthAnalyzer();
const passwordGenerator = new SecurePasswordGenerator();
const keychainManager = new KeychainManager();
const holidayPredictor = new HolidayPredictor();
// FIX 1: numeralConverter war undefiniert – NumeralToWordConverter wird hier korrekt instanziiert
const numeralConverter = new NumeralToWordConverter();

/**
 * Erkennt Zahlkonvertierungs-Anfragen und konvertiert sie
 * @param {string} query - Suchbegriff
 * @returns {Object|null} Instant Answer Objekt oder null
 */
function detectNumeralQuery(query) {
    if (!query) return null;
    
    const trimmed = query.trim();
    
    // Pattern: pure Zahlen (mit Optional Leerzeichen/Punkten als Tausender-Separator)
    // z.B. "123", "1234", "1.234", "1 000 000", "123,456"
    const numberPattern = /^[\d\s.,]+$/;
    if (!numberPattern.test(trimmed)) return null;
    
    // Filtere reine Rechner-Anfragen (keine zusätzlichen Wörter)
    const cleanNumber = trimmed.replace(/[\s.,]/g, '');
    if (cleanNumber.length === 0 || cleanNumber.length > 18) return null; // BigInt Limit beachten
    
    try {
        const converted = numeralConverter.convert(cleanNumber, { cache: true });
        
        // Nur wenn Konvertierung erfolgreich war und nicht "Ungültige Eingabe"
        if (converted === 'Ungültige Eingabe' || converted === 'null') return null;
        
        // Prüfe ob wirklich eine "echte" Konvertierung stattgefunden hat
        if (converted === cleanNumber) return null;
        
        return {
            type: 'numeral',
            input: new Intl.NumberFormat('de-DE').format(parseInt(cleanNumber)),
            output: converted,
            decimal: null, // Optional für später: Dezimalunterstützung
            confidence: 0.95
        };
    } catch (err) {
        return null;
    }
}

// ── URL-Qualitäts-Map (Pogo-Tracking, alle 6h neu geladen) ──────────────
let urlQualitaetMap = new Map();
async function urlQualitaetMapAktualisieren() {
    urlQualitaetMap = await pogoTracking.getUrlQualitaetMap(sessionPool);
}
urlQualitaetMapAktualisieren(); // Beim Start einmal laden
setInterval(urlQualitaetMapAktualisieren, 6 * 60 * 60 * 1000); // Alle 6h

// ── Trend-Map (alle 15 Min neu geladen) ─────────────────────────────────
let trendMap = new Map();
async function trendMapAktualisieren() {
    try {
        await trendEngine.trendsScannen(sessionPool);
        trendMap = await trendEngine.getTrendMap(sessionPool);
    } catch (err) {
        console.error('[Trends] Fehler beim Aktualisieren:', err.message);
    }
}
trendMapAktualisieren(); // Beim Start einmal laden
setInterval(trendMapAktualisieren, 15 * 60 * 1000); // Alle 15 Min

// ── Synonyme aus DB laden (luma_synonyme Tabelle, ersetzt synonyms.json) ──
synonyms.setPool(sessionPool);
synonyms.loadSynonyms().catch(err => console.warn('[Synonyms] Ladefehler:', err.message));

// ── Such-Cache — Redis mit In-Memory Fallback ───────────────────────────
const CACHE_TTL_SEK = 5 * 60; // 5 Minuten
// Fallback wenn Redis nicht verfügbar
const _localCache = new Map();

function getCacheKey(query, tab, page, lang = 'de') {
    return `luma:search:${query.toLowerCase()}|${tab}|${page}|${lang}`;
}

async function getFromCache(key) {
    // Zuerst Redis versuchen
    const cached = await redis.get(key);
    if (cached) return cached;
    // Fallback: lokaler Cache
    const local = _localCache.get(key);
    if (!local) return null;
    if (Date.now() - local.ts > CACHE_TTL_SEK * 1000) { _localCache.delete(key); return null; }
    return local.data;
}

async function setCache(key, data) {
    // In Redis speichern
    await redis.set(key, data, CACHE_TTL_SEK);
    // Fallback lokal auch speichern
    if (_localCache.size > 1000) _localCache.delete(_localCache.keys().next().value);
    _localCache.set(key, { data, ts: Date.now() });
}

router.get('/search', searchLimiter, async (req, res) => {
    const requestStart = Date.now();
    const query = req.query.q ? req.query.q.trim() : "";
    const activeTab = req.query.tab || 'Alles';
    const page = parseInt(req.query.page || '1', 10);
    const timeFilter = req.query.time || 'all'; // 'd' = 24h, 'w' = Woche, 'm' = Monat, 'all' = alle
    const langFilter = req.query.lang || 'all'; // 'de', 'en', 'all'
    
    // Unterschiedliche Limits pro Tab: "all" = 10, andere Tabs = unbegrenzt
    const resultsPerPage = (activeTab === 'all' || activeTab === 'Alles') ? 10 : 1000;

    if (!query) {
        return res.json({ results: [], total: 0, page: 1, resultsPerPage: 0 });
    }

    // Zu kurze Queries nicht verarbeiten — verhindert dass Autocomplete-Tipp-Schritte
    // ("n", "ne", "new") als Trends gezählt werden
    if (query.trim().length < 3) {
        return res.json({ results: [], total: 0, page: 1, resultsPerPage: 0 });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SEARCH OPERATORS: site:, intitle:, filetype: extrahieren
    // ─────────────────────────────────────────────────────────────────────────────
    const operators = { site: null, intitle: null, filetype: null };
    let cleanQuery = query;
    
    const operatorRegex = /(\w+):([^\s]+)/g;
    let match;
    while ((match = operatorRegex.exec(query)) !== null) {
        if (match[1] in operators) {
            operators[match[1]] = match[2];
            cleanQuery = cleanQuery.replace(match[0], '').trim();
        }
    }
    
    // Debug-Log für aktivierte Operatoren
    const activeOperators = Object.entries(operators)
        .filter(([_, val]) => val !== null)
        .map(([key, val]) => `${key}:${val}`);
    if (activeOperators.length > 0) {
        console.log(`🔍 SEARCH OPERATORS: ${activeOperators.join(' & ')} | Clean Query: "${cleanQuery}"`);
    }

    // Suchanfrage tracken (fire-and-forget)
    if (req.session && req.session.userId) {
        sessionPool.query("SELECT public.aktivitaet_eintragen($1, 'suche')", [req.session.userId]).catch(() => {});
    }

    // Pogo-Rückkehr erkennen: rueckkehrErfassen prüft intern ob ein offener
    // Klick (verweilzeit_ms IS NULL) für diese Session existiert — ist keiner da,
    // passiert nichts. Kein Referer-Check nötig.
    const sessionId = req.session?.id || 'anonym';
    pogoTracking.rueckkehrErfassen(sessionPool, { sessionId }).catch(() => {});

    try {
        // --- PHASE 1: SPECIAL MODULES (Instant Answers) ---

        // A. Calculator (nutze cleanQuery, nicht Query mit Operatoren)
        const calcResult = calculator.calculate(cleanQuery);
        const isValidNumber = !isNaN(parseFloat(calcResult)) && isFinite(calcResult);
        if (isValidNumber && activeTab === 'Alles') {
            const factResult = {
                results: [{
                    isFact: true,
                    title: 'Luma Rechner',
                    content: `${escapeHtml(cleanQuery)} = <strong>${calcResult}</strong>`,
                    url: '#'
                }],
                total: 1, page: 1, resultsPerPage: 1
            };
            eventTracker.trackSearch(cleanQuery, factResult.results, Date.now() - requestStart, activeTab);
            return res.json(factResult);
        }

        // B. Currency Converter (nutze cleanQuery)
        const currencyResult = convertCurrency(cleanQuery);
        if (currencyResult && activeTab === 'Alles') {
            const factResult = {
                results: [{
                    isFact: true,
                    title: 'Luma Währungsrechner',
                    content: escapeHtml(currencyResult),
                    url: '#'
                }],
                total: 1, page: 1, resultsPerPage: 1
            };
            eventTracker.trackSearch(cleanQuery, factResult.results, Date.now() - requestStart, activeTab);
            return res.json(factResult);
        }

        // --- PHASE 1b: INSTANT ANSWERS (nutze cleanQuery) ---
        const instantAnswerPromises = [
            Promise.resolve(findSupportNumber(cleanQuery)),
            Promise.resolve(findAcronym(cleanQuery)),
            Promise.race([
                weatherSource(cleanQuery),
                new Promise(r => setTimeout(() => r(null), 5000))
            ]),
            Promise.resolve(wattWaechter(cleanQuery)),
            Promise.resolve(detectNumeralQuery(cleanQuery))
        ];
        const [supportAnswer, acronymAnswer, weatherAnswer, wattAnswer, numeralAnswer] = await Promise.all(instantAnswerPromises);

        const instantAnswers = [supportAnswer, acronymAnswer, weatherAnswer, wattAnswer, numeralAnswer].filter(Boolean);

        // --- PHASE 2: FULL-TEXT SEARCH (if no instant answer) ---

        // DB Load aus Postgres (async, mit Cache)
        let db = await loadDatabase();
        if (db.length === 0) {
            return res.json({ results: [], total: 0, page: 1, resultsPerPage: 0 });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // SEARCH OPERATORS ANWENDEN: site:, intitle:, filetype: Filter
        // ─────────────────────────────────────────────────────────────────────────────
        let filteredByOperators = db.length;
        
        if (operators.site) {
            db = db.filter(r => {
                try {
                    return new URL(r.url).hostname.includes(operators.site.toLowerCase());
                } catch (e) { return false; }
            });
            console.log(`   📍 site:${operators.site} → ${db.length} Treffer (von ${filteredByOperators})`);
            filteredByOperators = db.length;
        }
        
        if (operators.intitle) {
            db = db.filter(r => 
                (r.title || '').toLowerCase().includes(operators.intitle.toLowerCase())
            );
            console.log(`   📝 intitle:${operators.intitle} → ${db.length} Treffer (von ${filteredByOperators})`);
            filteredByOperators = db.length;
        }
        
        if (operators.filetype) {
            db = db.filter(r => {
                try {
                    const urlPath = new URL(r.url).pathname.toLowerCase();
                    return urlPath.endsWith(`.${operators.filetype.toLowerCase()}`);
                } catch (e) { return false; }
            });
            console.log(`   📄 filetype:${operators.filetype} → ${db.length} Treffer (von ${filteredByOperators})`);
        }
        
        // FIX 3: Wenn Operatoren zu viele gefiltert haben → nutzerfreundliche Fehlermeldung statt leerem Array
        if (db.length === 0 && Object.values(operators).some(v => v !== null)) {
            const usedOps = Object.entries(operators)
                .filter(([_, v]) => v !== null)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ');
            console.log(`   ⚠️  WARNUNG: Operatoren haben alle Ergebnisse gefiltert! (${usedOps})`);
            return res.json({
                results: [],
                total: 0,
                page: 1,
                resultsPerPage: 0,
                // operatorHint wird im Frontend angezeigt, damit der Nutzer versteht warum keine Ergebnisse kamen
                operatorHint: `Keine Ergebnisse für ${usedOps} — versuche einen anderen Suchbegriff oder entferne den Filter.`
            });
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // FIX 2: CACHE-CHECK — so früh wie möglich, VOR Spell-Check und Synonym-Expansion
        // Vorher stand dies nach dem teuren Spell-Check (Zeile ~325), was unnötige Arbeit
        // bei jedem Cache-Hit bedeutete. Jetzt: Cache-Hit → sofort zurück, 0 Rechenzeit.
        // ─────────────────────────────────────────────────────────────────────────────
        const langHeader = req.headers['accept-language'] || 'de';
        const userLanguage = langHeader.split(',')[0].split('-')[0];

        const cacheKey = getCacheKey(`${query}|time:${timeFilter}|lang:${langFilter}`, activeTab, page, userLanguage);
        const cached = await getFromCache(cacheKey);
        if (cached) {
            console.log(`✓ Cache HIT: "${query}" [${Date.now() - requestStart}ms]`);
            eventTracker.trackSearch(query, cached.results, 0, activeTab);
            // Blacklist + Whitelist pro Nutzer anwenden (Cache ist global, Listen sind nutzerspezifisch)
            const blFiltered = await applyBlacklist(cached, req.session?.userId);
            const filteredCached = await applyWhitelist(blFiltered, req.session?.userId);
            return res.json(filteredCached);
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // FACETED FILTERS: Zeit- und Sprachfilter anwenden (aus URL-Parametern)
        // ─────────────────────────────────────────────────────────────────────────────
        const dbBeforeFilter = db.length;

        // Zeitfilter
        if (timeFilter !== 'all') {
            const cutoffDays = { d: 1, w: 7, m: 30 }[timeFilter];
            if (cutoffDays) {
                const since = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
                db = db.filter(r => {
                    const date = r.publishedDate || r.veroeffentlicht_am || r.crawledAt || r.gecrawlt_am;
                    if (!date) return false;
                    return new Date(date) >= since;
                });
                const label = { d: 'Letzte 24h', w: 'Letzte Woche', m: 'Letzter Monat' }[timeFilter];
                console.log(`   ⏱  Zeitfilter [${label}]: ${db.length} von ${dbBeforeFilter} Ergebnissen`);
            }
        }

        // Sprachfilter
        if (langFilter !== 'all') {
            db = db.filter(r => (r.language || r.sprache || 'de') === langFilter);
            console.log(`   🌐 Sprachfilter [${langFilter}]: ${db.length} von ${dbBeforeFilter} Ergebnissen`);
        }

        // Wenn Filter zu streng → nutzerfreundliche Meldung
        if (db.length === 0 && dbBeforeFilter > 0) {
            const filterLabels = [];
            if (timeFilter !== 'all') filterLabels.push({ d: 'Letzte 24h', w: 'Letzte Woche', m: 'Letzter Monat' }[timeFilter]);
            if (langFilter !== 'all') filterLabels.push(langFilter === 'de' ? 'Deutsch' : 'Englisch');
            console.log(`   ⚠️  Filter haben alle ${dbBeforeFilter} Ergebnisse herausgefiltert (${filterLabels.join(', ')})`);
            return res.json({
                results: [],
                total: 0,
                page: 1,
                resultsPerPage: 0,
                filterHint: `Keine Ergebnisse für den Filter "${filterLabels.join(', ')}" — versuche einen anderen Zeitraum oder entferne den Filter.`,
                activeFilters: { time: timeFilter, lang: langFilter }
            });
        }

        // 🔤 DID YOU MEAN — wird hier initialisiert, später ggf. durch fuzzy-search überschrieben
        let didYouMean = null;
        let fuzzyQuery = null;

        // ⚡ SPELL-CHECK & SYNONYM EXPANSION (Google-ähnliche Intelligenz)
        const knownTerms = db.map(item => item.title).concat(db.map(item => item.content.substring(0, 50)));
        
        // 🆕 WICHTIG: Alle existierenden Synonyme zu knownTerms hinzufügen
        // Damit der Spell Checker "nachichten" → "nachrichten" korrigiert, auch wenn "nachrichten" nicht in der DB vorkommt
        const synonymsModule = require('../../modules/synonyms/synonyms');
        const allWords = new Set();
        // Funktioniert durch expandQuery() für jeden Begriff
        if (cleanQuery && cleanQuery.length > 2) {
            const expanded = synonymsModule.expandQuery(cleanQuery);
            expanded.forEach(w => allWords.add(w));
        }
        knownTerms.push(...Array.from(allWords));

        // Tippfehler-Korrektur
        const spellCheckResult = spellChecker.correctSpelling(cleanQuery, knownTerms);
        const correctedQuery = spellCheckResult.corrected || cleanQuery;

        // Synonym-Expansion
        const enhancedQuery = synonyms.getEnhancedQuery(correctedQuery);

        // ─────────────────────────────────────────────────────────────────
        // DID YOU MEAN: Spell-Korrektur-Vorschlag (Google-ähnlich)
        // ─────────────────────────────────────────────────────────────────
        if (spellCheckResult.hasSuggestions) {
            console.log(`🔤 Tippfehler korrigiert: "${cleanQuery}" → "${correctedQuery}"`);
            // Hier wird didYouMean INITIAL gesetzt (wird später ggf. überschrieben durch fuzzy search)
            if (!didYouMean) {
                didYouMean = {
                    type: 'spelling',
                    topSuggestion: correctedQuery,
                    message: `Angezeigt werden Ergebnisse für <strong>${escapeHtml(correctedQuery)}</strong>`,
                    wouldYouLike: `Möchtest du stattdessen nach "${escapeHtml(cleanQuery)}" suchen?`,
                    suggestions: [correctedQuery]
                };
            }
        }

        if (enhancedQuery.alternativeTerms.length > 0) {
            console.log(`📚 Synonyme gefunden für "${correctedQuery}": ${enhancedQuery.alternativeTerms.join(', ')}`);
        }

        // Community-Votes vorab laden (1 DB-Query für alle Domains)
        let votesMap = new Map();
        try {
            const domains = db.reduce((acc, item) => {
                try { acc.push(new URL(item.url).hostname.replace(/^www\./, '').toLowerCase()); } catch(e) {}
                return acc;
            }, []);
            votesMap = await votesManager.getVotesBatch(domains);
        } catch (voteErr) {
            console.warn('[VOTES] Batch-Fetch fehlgeschlagen, Ranking ohne Community-Daten:', voteErr.message);
        }

        // Paywall-Status vorab laden (1 DB-Query für alle Domains)
        let paywallMap = new Map();
        try {
            const domains = db.reduce((acc, item) => {
                try { acc.push(new URL(item.url).hostname.replace(/^www\./, '').toLowerCase()); } catch(e) {}
                return acc;
            }, []);
            paywallMap = await require('../../data/paywall-manager').getPaywallBatch(domains);
            const paywallCount = Array.from(paywallMap.values()).filter(v => v > 0).length;
            console.log(`🔒 PAYWALL DATEN GELADEN: ${paywallCount} Domains mit Paywall von ${domains.length} total`);
            if (paywallCount > 0) {
                const examples = Array.from(paywallMap.entries()).filter(([_, v]) => v > 0).slice(0, 5);
                console.log(`   Beispiele: ${examples.map(([d, v]) => d).join(', ')}`);
            }
        } catch (paywallErr) {
            console.warn('[PAYWALL] Batch-Fetch fehlgeschlagen, Ranking ohne Paywall-Daten:', paywallErr.message);
        }

        // Domain Trust Scores aus luma_domains laden (vertrauen_gesamt)
        let domainTrustMap = new Map();
        try {
            const domains = db.reduce((acc, item) => {
                try { acc.push(new URL(item.url).hostname.replace(/^www\./, '').toLowerCase()); } catch(e) {}
                return acc;
            }, []);
            if (domains.length > 0) {
                const trustRes = await sessionPool.query(
                    `SELECT domain, vertrauen_gesamt, pagerank_score, vote_score, spam_score
                     FROM luma_domains
                     WHERE domain = ANY($1::text[])
                       AND vertrauen_gesamt IS NOT NULL`,
                    [domains]
                );
                for (const row of trustRes.rows) {
                    domainTrustMap.set(row.domain, {
                        vertrauen:  parseFloat(row.vertrauen_gesamt) || 0.5,
                        pagerank:   parseFloat(row.pagerank_score)   || 0,
                        vote:       parseFloat(row.vote_score)       || 0.5,
                        spam:       parseFloat(row.spam_score)       || 0,
                    });
                }
                if (domainTrustMap.size > 0) {
                    console.log(`🏆 Domain Trust geladen: ${domainTrustMap.size} Domains`);
                }
            }
        } catch (trustErr) {
            console.warn('[DOMAIN-TRUST] Fehler beim Laden:', trustErr.message);
        }

        // ─────────────────────────────────────────────────────────────────────────────
        // FIX 4: KNOWLEDGE GRAPH + FEDERATED SEARCH (Wikipedia / Wikidata)
        // Beantwortet allgemeine Fragen direkt in den Suchergebnissen, ähnlich wie
        // Google's Knowledge Panel. Kombiniert eigene News-Fakten mit Wikipedia.
        //
        // Architektur (Federated Search):
        //   [Eigene DB] + [Fakten-Check] + [Wikipedia API] → eine SERP
        //
        // Aktiviert für: Faktenfragen, Personen, Orte, Konzepte, allg. Wissensfragen
        // ─────────────────────────────────────────────────────────────────────────────
        let knowledgePanel = null;

        // Nur bei Tab "Alles" und wenn Query plausibel für Knowledge Graph ist
        // (nicht bei reinen Operatoren-Suchen wie site:, filetype:)
        const isKnowledgeQuery = activeTab === 'Alles'
            && cleanQuery.length > 2
            && !Object.values(operators).some(v => v !== null);

        if (isKnowledgeQuery) {
            try {
                // Wikipedia Zusammenfassung abrufen (REST API, kein API-Key nötig)
                const wikiUrl = `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery)}`;
                const wikiResponse = await Promise.race([
                    fetch(wikiUrl, { headers: { 'User-Agent': 'Luma-Search/1.0' } }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
                ]);

                if (wikiResponse.ok) {
                    const wikiData = await wikiResponse.json();

                    // Nur anzeigen wenn Wikipedia wirklich einen passenden Artikel gefunden hat
                    // (type: 'standard' = echter Artikel, nicht Disambiguierung)
                    if (wikiData.type === 'standard' && wikiData.extract && wikiData.extract.length > 50) {
                        knowledgePanel = {
                            type: 'knowledge_panel',
                            title: wikiData.title || cleanQuery,
                            extract: wikiData.extract.substring(0, 400) + (wikiData.extract.length > 400 ? '…' : ''),
                            image: wikiData.thumbnail?.source || null,
                            url: wikiData.content_urls?.desktop?.page || `https://de.wikipedia.org/wiki/${encodeURIComponent(wikiData.title)}`,
                            source: 'Wikipedia',
                            description: wikiData.description || null,
                            // Koordinaten für Orte (falls vorhanden)
                            coordinates: wikiData.coordinates ? {
                                lat: wikiData.coordinates.lat,
                                lon: wikiData.coordinates.lon
                            } : null
                        };
                        console.log(`📚 Knowledge Panel: "${wikiData.title}" (Wikipedia, ${wikiData.extract.length} Zeichen)`);
                    }
                }
            } catch (wikiErr) {
                // Nicht-kritisch: Knowledge Panel ist optional, Suche läuft trotzdem
                console.warn(`[KnowledgeGraph] Wikipedia-Abfrage fehlgeschlagen für "${cleanQuery}": ${wikiErr.message}`);
            }

            // DEPRECATED: Alte Fakten-Check Daten entfernt
            // Das System wurde auf Widerspruchs-Erkennung (shingler.js, widerspruchs_maschine.js) umgestellt.
            // Fakten werden nicht mehr automatisch generiert.
        }
        // ─── Ende FIX 4 ──────────────────────────────────────────────────────────────

        // Intelligence Context: keyword-Kontext aus luma_keywords DB
        // finalIntent = DB-Override wenn gefunden, sonst null → ranking.js nutzt eigene Regex-Erkennung
        const kwContext = await getKeywordContext(correctedQuery);
        
        // 🔄 SYNONYM-EXPANSION: Alle Synonyme sammeln (maximale Abdeckung)
        const expandedKeywords = synonyms.expandQuery(correctedQuery) || [];
        const synonymTerms = [
            ...new Set([
                ...enhancedQuery.alternativeTerms || [],
                ...expandedKeywords
            ])
        ];
        
        const intelligenceContext = {
            keywordFound: kwContext.keywordFound,
            kategorie:    kwContext.kategorie,
            finalIntent:  kwContext.intentOverride || null,  // null → ranking.js nutzt eigene Regex
            synonymTerms: synonymTerms,  // Alle Synonyme vereinigt (getEnhancedQuery + expandQuery)
        };

        if (kwContext.keywordFound) {
            console.log(`🧠 Intelligence: "${correctedQuery}" → Kategorie: ${kwContext.kategorie} | Intent-Override: ${kwContext.intentOverride || 'keiner'}`);
        }

        if (synonymTerms.length > 0) {
            console.log(`📚 SYNONYM-EXPANSION AKTIV: ${synonymTerms.length} Begriffe | ${synonymTerms.slice(0, 5).join(', ')}${synonymTerms.length > 5 ? ' ...' : ''}`);
        }

        // Soft-Personalisierung: Interessen des eingeloggten Nutzers laden
        const userInterests = req.session?.userId
            ? await getUserInterests(req.session.userId, sessionPool)
            : null;

        // ─── SEMANTISCHE SCORES VORBERECHNEN ─────────────────────────────────────
        // 1× pro Suche, dann gecacht in semanticAI
        const queryVektor      = await semanticAI.computeQueryEmbedding(correctedQuery);
        const semanticScoreMap = semanticAI.isReady()
            ? await semanticAI.getSemanticScores(sessionPool, db.map(r => r.url), queryVektor)
            : new Map();

        // Ranking mit verbesserter Query + Community-Votes + Intelligence + Personalisierung + Pogo-Qualität + Trends + Semantik + Domain Trust
        const rankedResults = ranking.getRankedResults(
            correctedQuery,
            db,
            activeTab,
            userLanguage,
            votesMap,
            intelligenceContext,
            userInterests,
            urlQualitaetMap,
            trendMap,
            semanticScoreMap,
            paywallMap,
            domainTrustMap
        );

        // Paginierung
        const specialItems = rankedResults.filter(r => r.isFeatured || r.isFact);
        const normalResults = rankedResults.filter(r => !r.isFeatured && !r.isFact);

        const startIndex = (page - 1) * resultsPerPage;
        const paginatedNormalResults = normalResults.slice(startIndex, startIndex + resultsPerPage);
        const finalResults = (page === 1) ? [...specialItems, ...paginatedNormalResults] : paginatedNormalResults;

        // ─── IMPRESSIONEN ERFASSEN (für CTR-Tracking) ─────────────────────────────
        // Läuft im Hintergrund, blockiert die Response nicht
        const impressionenListe = finalResults.slice(0, 10).map((e, idx) => ({
            url: e.url,
            position: idx + 1,
            suchanfrage: correctedQuery
        }));
        pogoTracking.impressionenErfassen(sessionPool, impressionenListe).catch(() => {});

        // 🛡️ FINALE AUFBEREITUNG & XSS-SCHUTZ
        const safeResults = finalResults.map(item => {
            if (item.isFact) return item;

            // -----------------------------------------------------------------
            // ❗ WICHTIGER FIX: Snippet-Problem beheben
            // -----------------------------------------------------------------
            // PROBLEM: Der Ranking-Algorithmus generiert manchmal ein schlechtes Snippet aus dem `fulltext`,
            // obwohl eine gute `meta_description` in der Datenbank existiert.
            // LÖSUNG: Wir überschreiben das Snippet vom Ranking mit unserer
            // Sicherheitskopie (`luma_meta_description`), falls diese existiert.
            let finalContent = (item.luma_meta_description && item.luma_meta_description.length > 10)
                               ? item.luma_meta_description
                               : item.content;

            // Community-Votes für dieses Item holen → Approval-Rating berechnen
            let itemVotes = { approvalRating: null, totalVotes: 0 };
            try {
                if (item.url && item.url !== '#') {
                    const domain = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase();
                    const voteData = votesMap.get(domain);
                    if (voteData) {
                        const totalVotes = voteData.total || 0;
                        const positiveVotes = voteData.positive || 0;
                        const negativeVotes = voteData.negative || 0;
                        const approvalRating = totalVotes > 0 && (positiveVotes + negativeVotes) > 0
                            ? Math.round((positiveVotes / (positiveVotes + negativeVotes)) * 100)
                            : null;
                        itemVotes = { approvalRating, totalVotes };
                    }
                }
            } catch (e) { /* ignore invalid URLs */ }

            // Highlighting neu anwenden (Titel UND Content) - ROBUST & DEDUPLIZIERT
            // 1. Begriffe deduplizieren und nach Länge sortieren (verhindert Substring-Probleme)
            const uniqueTerms = [...new Set(correctedQuery.toLowerCase().split(/\s+/))]
                .filter(t => t.length > 1)
                .sort((a, b) => b.length - a.length);

            const highlightText = (text) => {
                if (!text) return '';
                let clean = text.replace(/<\/?mark>/gi, ''); // Alte Markierungen entfernen
                for (const term of uniqueTerms) {
                    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Regex-Zeichen escapen
                    const termRegex = new RegExp(`\\b(${safeTerm})\\b`, 'i');
                    // Platzhalter verwenden um Nesting zu verhindern (z.B. "Wolf" in "Donnerwolf")
                    clean = clean.replace(termRegex, '##MARK##$1##ENDMARK##');
                }
                return clean.replace(/##MARK##/g, '<mark>').replace(/##ENDMARK##/g, '</mark>');
            };

            return {
                ...item,
                title: highlightText(item.title), // Auch Titel bereinigen!
                content: highlightText(finalContent),
                url: sanitizeUrl(item.url), // URL-Schutz aktivieren
                image: item.image, // Explizit sicherstellen
                src: item.image,    // Alias für Frontend-Kompatibilität (falls bilder.js 'src' erwartet)
                votes: itemVotes,
                // 🔓 PAYWALL-FELDER explizit einschließen
                isPaywall: item.ist_paywall || item.isPaywall || false,
                paywallConfidence: item.paywall_confidence || item.paywallConfidence || 0,
                paywallTyp: item.paywall_typ || item.paywallTyp || null,
                paywallGrund: item.paywall_grund || item.paywallGrund || null
            };
        });

        // 🤔 "MEINTEST DU...?" - Fuzzy Search Vorschläge bei <5 Ergebnissen
        // didYouMean und fuzzyQuery sind bereits initialisiert oben

        if (normalResults.length < 5 && page === 1) {
            // Extrahiere WÖRTER (nicht komplette Titel) aus DB für bessere Fuzzy Search
            const wordIndex = new Set();
            db.forEach(item => {
                // Titel in Wörter aufbrechen
                const words = item.title.toLowerCase()
                    .split(/[\s\-\(\)\[\]\.,;:&_\|\/]+/)
                    .filter(w => w.length > 3);
                words.forEach(w => wordIndex.add(w));

                // Auch Content durchsuchen
                if (item.content) {
                    const contentWords = item.content.substring(0, 100).toLowerCase()
                        .split(/[\s\-\(\)\[\]\.,;:&_\|\/]+/)
                        .filter(w => w.length > 3);
                    contentWords.forEach(w => wordIndex.add(w));
                }
            });

            // Hole "Meintest du...?" Vorschläge
            const suggestions = fuzzy.getMeintestDuSuggestions(correctedQuery, Array.from(wordIndex));

            if (suggestions.hasAlternatives) {
                didYouMean = {
                    message: suggestions.message, // enthält sichere HTML-Tags (<strong>); Wörter werden in fuzzy.js escaped
                    suggestions: suggestions.suggestions.map(s => escapeHtml(s)),
                    topSuggestion: escapeHtml(suggestions.topSuggestion),
                    wouldYouLike: escapeHtml(suggestions.wouldYouLike)
                };
                fuzzyQuery = escapeHtml(suggestions.topSuggestion);
                console.log(`🔍 Wenig Treffer für "${correctedQuery}" (${normalResults.length}). Vorschlag: "${fuzzyQuery}"`);
            }
        }

        // ── ECHTE "Ähnliche Suchanfragen" aus Query-Logs ─────────────────────────
        // Zeigt was andere Nutzer nach derselben Suche gesucht haben
        // Fallback: generateRelatedSearches wenn keine Log-Daten vorhanden
        let relatedSearches = [];
        try {
            const logRes = await sessionPool.query(`
                SELECT query, COUNT(*) as n
                FROM suchprotokoll
                WHERE timestamp > NOW() - INTERVAL '30 days'
                  AND query != $1
                  AND LENGTH(query) BETWEEN 3 AND 60
                  AND query NOT ILIKE '%passwort%'
                  AND query NOT ILIKE '%password%'
                  AND (
                      -- Nutzer die dieselbe Query hatten, suchten danach nach:
                      session_id IN (
                          SELECT DISTINCT session_id 
                          FROM suchprotokoll 
                          WHERE query ILIKE $2
                            AND timestamp > NOW() - INTERVAL '30 days'
                      )
                      -- ODER: Queries die ähnliche Keywords enthalten
                      OR query ILIKE $3
                      OR query ILIKE $4
                  )
                GROUP BY query
                ORDER BY n DESC
                LIMIT 8
            `, [
                query,
                `%${cleanQuery}%`,
                `%${cleanQuery.split(' ')[0]}%`,
                cleanQuery.split(' ').length > 1 ? `%${cleanQuery.split(' ').slice(-1)[0]}%` : `%${cleanQuery}%`
            ]);

            if (logRes.rows.length >= 3) {
                // Aus echten Query-Logs nehmen, aber Duplikate und die Originalquery entfernen
                relatedSearches = logRes.rows
                    .map(r => r.query.trim())
                    .filter(q => q.toLowerCase() !== query.toLowerCase())
                    .slice(0, 6)
                    .map(s => escapeHtml(s));
                console.log(`🔍 Ähnliche Suchanfragen aus Logs: ${relatedSearches.join(', ')}`);
            } else {
                // Fallback: alte Methode aus Suchergebnissen
                relatedSearches = normalResults.length > 0
                    ? (await generateRelatedSearches(query, normalResults.slice(0, 10))).map(s => escapeHtml(s))
                    : [];
            }
        } catch (logErr) {
            // Fallback bei DB-Fehler
            relatedSearches = normalResults.length > 0
                ? (await generateRelatedSearches(query, normalResults.slice(0, 10))).map(s => escapeHtml(s))
                : [];
        }

        const response = {
            results:        safeResults,
            total:          normalResults.length,
            totalItems:     normalResults.length,
            page:           page,
            resultsPerPage: resultsPerPage,
            didYouMean:     didYouMean,
            fuzzyQuery:     fuzzyQuery,
            relatedSearches: relatedSearches,
            instantAnswers: instantAnswers,
            // FIX 4: Knowledge Panel (Wikipedia) – wird vom Frontend als Infobox angezeigt
            knowledgePanel: knowledgePanel || null,
            // FACETED FILTERS: Aktive Filter zurück ans Frontend
            activeFilters: { time: timeFilter, lang: langFilter }
        };

        // Cache speichern (OHNE Blacklist — Blacklist ist nutzerspezifisch)
        // Cache: fulltext und structuredData weglassen (zu gross, nicht nötig)
        const cacheResponse = {
            ...response,
            results: (response.results || []).map(r => {
                const { fulltext, structuredData, ...rest } = r;
                return rest;
            })
        };
        await setCache(cacheKey, cacheResponse);

        // 📊 Track Search für Admin Dashboard
        const duration = Date.now() - requestStart;
        eventTracker.trackSearch(query, finalResults, duration, activeTab);
        eventTracker.trackPerformance('/search', duration, 200);

        console.log(`[SEARCH] "${sanitizeInput(query)}" | ${normalResults.length} Treffer | Page ${page} | Security: OK | ${duration}ms`);

        // Blacklist + Whitelist pro Nutzer anwenden (nach Cache-Speicherung)
        const blFiltered = await applyBlacklist(response, req.session?.userId);
        const filteredResponse = await applyWhitelist(blFiltered, req.session?.userId);
        res.json(filteredResponse);

    } catch (error) {
        console.error("❌ Search Error:", error);
        const duration = Date.now() - requestStart;
        eventTracker.trackPerformance('/search', duration, 500);
        res.status(500).json({ error: "Search failed", results: [] });
    }
});

// ── SESSION-ID ENDPOINT ───────────────────────────────────────────────────────────
// Gibt die Express-Session-ID zurück damit Frontend und rueckkehrErfassen() dieselbe ID nutzen.
router.get('/api/session-id', (req, res) => {
    res.json({ sid: req.session?.id || '' });
});

// ── CLICK-TRACKING ─────────────────────────────────────────────────────────────
// Empfängt Klick-Daten vom Frontend (sendBeacon) und protokolliert sie.
// Für DB-Speicherung: ALTER TABLE suchprotokoll ADD COLUMN clicked_url TEXT;
//                     ALTER TABLE suchprotokoll ADD COLUMN result_position INTEGER;
router.post('/api/click', [
    require('express').text({ type: '*/*' }),
    require('express').raw({ type: '*/*' }),
    require('express').json({ type: 'application/json' }),
], async (req, res) => {
    // sendBeacon schickt Blob als application/octet-stream oder text/plain
    // fetch keepalive schickt application/json
    // Alle drei Fälle abdecken:
    let body = req.body;
    if (Buffer.isBuffer(body)) {
        try { body = JSON.parse(body.toString('utf-8')); } catch { return res.sendStatus(400); }
    } else if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.sendStatus(400); }
    }
    if (!body || typeof body !== 'object') return res.sendStatus(400);

    const { query = '', url = '', position = -1, domain = '', sessionId = '', quelle = 'alles' } = body;
    if (!url) return res.sendStatus(400);

    console.log(`[CLICK] Query: "${sanitizeInput(String(query).substring(0, 100))}" | Pos: ${Number(position)} | URL: ${String(url).substring(0, 200)}`);

    // Klick in DB speichern für Pogo-Tracking
    const resolvedSessionId = sessionId || req.session?.id || 'anonym';
    const resolvedDomain    = domain || (() => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } })();
    pogoTracking.klickErfassen(sessionPool, {
        url:        String(url).substring(0, 2000),
        domain:     resolvedDomain,
        sessionId:  resolvedSessionId,
        nutzerId:   req.session?.userId || null,
        position:   Number(position) || 0,
        suchanfrage: String(query).substring(0, 500),
        quelle:     String(quelle).substring(0, 50),
    }).catch(() => {});

    res.sendStatus(204);
});

// ── HOLIDAY AUTOCOMPLETE ───────────────────────────────────────────────────
// Dual-Mode:
// 1. REAKTIV: q=Ostern → zeige Countdown für diese Holiday
// 2. PROAKTIV: suggest=true&days=7 → zeige Holiday wenn in 7 Tagen ansteht
router.get('/holiday_autocomplete', (req, res) => {
    try {
        const query = req.query.q || '';
        const isSuggest = req.query.suggest === 'true';
        const daysAhead = parseInt(req.query.days) || 7;

        let result = null;

        if (isSuggest) {
            // ──── PROAKTIV ────────────────────────────────────────────────
            // Automatischer Vorschlag wenn Feiertag in daysAhead Tagen ansteht
            // (Zeige auch ohne dass Nutzer danach sucht!)
            result = holidayPredictor.getSuggestedHoliday(daysAhead);
        } else if (query) {
            // ──── REAKTIV ─────────────────────────────────────────────────
            // Nutzer sucht explizit nach Holiday (z.B. "Ostern", "Weihnachten")
            if (!holidayPredictor.isHolidayQuery(query)) {
                return res.json(null);
            }
            result = holidayPredictor.getNextHoliday(query);
        } else {
            // Keine Query und kein Suggest → nothing to do
            return res.json(null);
        }

        if (!result) {
            return res.json(null);
        }

        // Response für Autocomplete
        res.json({
            type: 'holiday',
            name: result.name,
            icon: result.icon,
            output: result.output,
            daysRemaining: result.daysRemaining,
            dateString: result.dateString,
            confidence: result.confidence
        });
    } catch (err) {
        console.error('Holiday autocomplete error:', err);
        res.status(500).json(null);
    }
});

// ── PASSWORD GENERATOR ─────────────────────────────────────────────────────
// Generates a secure password automatically
router.get('/password_generate', (req, res) => {
    try {
        const options = {
            length: parseInt(req.query.length) || 24,
            useUppercase: req.query.upper !== 'false',
            useLowercase: req.query.lower !== 'false',
            useNumbers: req.query.numbers !== 'false',
            useSymbols: req.query.symbols !== 'false'
        };

        const result = passwordGenerator.generateMaxSecurity();

        if (result.error) {
            return res.status(400).json({ error: result.message });
        }

        // Speichere im Keychain (Memory-only, 15 Min TTL)
        const passwordKey = `pwd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const keychainResult = keychainManager.setPassword(passwordKey, result.password);

        // Gebe Passwort zurück PLUS Keychain-Info
        res.json({
            type: 'password-generated',
            password: result.password,
            passwordKey: passwordKey,
            length: result.length,
            entropy: result.entropy,
            score: result.score,
            label: result.label,
            color: result.color,
            crackTime: result.estimated_CrackTime,
            keychain: keychainResult,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('Password generation error:', err);
        res.status(500).json({ error: 'Generation fehlgeschlagen' });
    }
});

// ── PASSWORD ANALYZER ──────────────────────────────────────────────────────
// Analyzes password strength
router.post('/password_analyze', (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Passwort erforderlich' });
        }

        // Analysiere Passwort
        const analysis = passwordAnalyzer.analyze(password, { useCache: false, detailed: true });

        if (analysis.error) {
            return res.status(400).json({ error: 'Analyse fehlgeschlagen' });
        }

        res.json({
            type: 'password-analysis',
            score: analysis.score,
            label: analysis.label,
            icon: analysis.icon,
            color: analysis.color,
            entropy: analysis.entropy,
            characterCount: analysis.characterCount,
            charTypes: analysis.charTypes,
            crackTime: analysis.crackTime,
            nistScore: analysis.nistScore,
            nistCompliant: analysis.nistCompliant,
            weakPatterns: analysis.weakPatterns,
            recommendations: analysis.recommendations,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('Password analysis error:', err);
        res.status(500).json({ error: 'Analyse fehlgeschlagen' });
    }
});

// ── KEYCHAIN STATS ─────────────────────────────────────────────────────────
// Returns Keychain statistics (without passwords!)
router.get('/keychain_stats', (req, res) => {
    try {
        const stats = keychainManager.getStats();
        const keys = keychainManager.getAllKeys();

        res.json({
            type: 'keychain-info',
            stats: stats,
            keys: keys,
            warning: '⚠️ Alle Passwörter werden nach 15 Min automatisch gelöscht!',
            security: '🔒 Memory-only, keine Speicherung'
        });
    } catch (err) {
        console.error('Keychain stats error:', err);
        res.status(500).json({ error: 'Stats abrufen fehlgeschlagen' });
    }
});

// DEPRECATED: Fakten-Suche entfernt
// Das alte Fakten-Generator System (processor.js, search-fakten.js) wurde gelöscht.
// Das System wurde auf Widerspruchs-Erkennung umgestellt (shigler.js, widerspruchs_maschine.js)
// router.get('/api/facts', async (req, res) => { ... })

module.exports = router;