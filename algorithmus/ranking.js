/**
 * LUMA RANKING ENGINE - v3.0
 * Fokus: Authentische, hochwertige, vertrauenswürdige Websites
 * Alternative zu Google mit echten, nicht manipulierten Ergebnissen
 * 
 * 6-PHASEN SYSTEM:
 * 1. Spam-Filter + Trust-Score → Blockiert unautentische Seiten
 * 2. Relevanz-Berechnung → Keyword + Intent + Struktur Match
 * 3. Finale Score-Berechnung → Trust (40%) + Relevance (35%) + Qualität (25%)
 * 4. Tab-Filterung → Images, Videos, News
 * 5. Sortierung → Nach finalScore absteigend
 * 6. Text-Highlighting → Query-Terme markieren
 */

const spamFilter = require('./spam-filter');
const trustScore = require('./trust-score');
const qualityMetrics = require('./quality-metrics');
const { getSemanticAIBonus } = require('./intelligence/semantic-intelligence');
const { getSemanticBonus } = require('./intelligence/semantic-engine');
const { getWeights } = require('./intelligence/dynamic-weights');
const { getDomainAuthorityBonus } = require('../data/domain-authority');
const LumaCleaner = require('../luma-cleaner/cleaner-logic');
const domainDiversity   = require('./domain-diversity');
const sourceReliability = require('./ads/source-reliability');
const adDensityMalus    = require('./ads/ad-density-malus');
const { getCategoryPenalty } = require('./intelligence/category-mismatch');
const pogoTracking = require('./pogo-tracking');  // 🆕 POGO-TRACKING INTEGRATION

// 🆕 SYNONYM-MODUL für multilingual Keyword-Matching in Phase 2.5
let synonymsModule = null;
try {
    synonymsModule = require('../modules/synonyms/synonyms');
} catch (e) {
    console.warn('⚠️  Synonym-Modul nicht gefunden, Phase 2.5 arbeitet nur auf Original-Termen');
}

function highlightText(text, query) {
    if (!text || !query) return text;
    const terms = query.trim().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return text;
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = `(${escapedTerms.join('|')})`;
    const regex = new RegExp(pattern, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

module.exports = {
    getRankedResults: function(query, data, activeTab, userLanguage = 'de', votesMap = new Map(), intelligenceContext = {}, userInterests = null, urlQualitaetMap = new Map(), queryVector = null, semanticScoreMap = new Map(), paywallMap = new Map(), domainTrustMap = new Map()) {
        const q = query.toLowerCase().trim();
        if (!q) return [];

        let searchIntent = qualityMetrics.detectSearchIntent(query);
        
        // 🆕 FALLBACK: Falls Intent GENERAL ist aber Synonyme NEWS-Wörter enthalten, wechsel zu NEWS
        if (searchIntent === 'GENERAL' && intelligenceContext.synonymTerms && intelligenceContext.synonymTerms.length > 0) {
            for (const synonym of intelligenceContext.synonymTerms) {
                const synonymIntent = qualityMetrics.detectSearchIntent(synonym);
                if (synonymIntent === 'NEWS') {
                    searchIntent = 'NEWS';
                    break;
                }
            }
        }
        
        // DB-basierter Intent hat Vorrang vor Regex-Intent
        let effectiveIntent = (intelligenceContext && intelligenceContext.finalIntent) || searchIntent;
        let isNewsQuery = effectiveIntent === 'NEWS';

        // Dynamische Gewichte je nach erkanntem Intent
        let weights = getWeights(effectiveIntent, query);

        // ════════════════════════════════════════════════════════════════════════════
        // INTELLIGENCE CONTEXT LOG
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`\n${'═'.repeat(90)}`);
        console.log(`🧠 INTELLIGENCE CONTEXT`);
        console.log(`${'═'.repeat(90)}`);
        console.log(`   🔍 Regex-Intent:      ${searchIntent}`);
        console.log(`   🗄️  DB-Override:       ${intelligenceContext.finalIntent || '(keiner)'} ${intelligenceContext.kategorie ? `→ Kategorie: ${intelligenceContext.kategorie}` : ''}`);
        console.log(`   🎯 Effektiver Intent:  ${effectiveIntent}`);
        console.log(`   ⚖️  Gewichte:          Trust ${weights.trust}% | Relevanz ${weights.relevance}%${weights.freshness ? ` | Freshness ${weights.freshness}%` : ''}`);
        console.log(`   🔑 Keyword DB-Match:   ${intelligenceContext.keywordFound ? `✓ Ja → +5 Punkte pro Ergebnis` : '✗ Nein'}`);
        console.log(`   🧬 AI Vector:          ${queryVector ? '✓ Berechnet' : '✗ Nicht verfügbar'}`);
        console.log(`   🔗 Domain Authority:   Aktiv (luma_links → bis +10 Pkt pro verlinkte Domain)`);
        console.log(`${'═'.repeat(90)}\n`);

        // Tracking
        let stats = {
            totalProcessed: 0,
            spamBlocked: { CRITICAL: 0, HIGH: 0 },
            lowTrustBlocked: 0,
            phase2Filtered: 0,
            relevanceFiltered: 0,
            finalResults: 0
        };

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 1: SPAM-FILTER + TRUST-SCORE
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`\n${'█'.repeat(90)}`);
        console.log(`🚀 LUMA RANKING ENGINE START - Query: "${query}"`);
        console.log(`${'█'.repeat(90)}`);
        console.log(`\n📍 PHASE 1: SPAM-FILTER + TRUST-SCORE ANALYSE\n`);
        
        let spamDetails = [];
        let results = data
            .map(item => {
                stats.totalProcessed++;
                
                const spamAnalysis = spamFilter.analyzeItem(item);
                const trust = trustScore.calculateTrustScore(item);

                // 🧼 URL waschen (für sauberes Tracking & Matching mit Statistiken)
                const cleanUrl = LumaCleaner.washUrl(item.url);
                item.cleanUrl = cleanUrl;
                
                // HARD BLOCK: Kritischer Spam
                if (spamAnalysis.spamLevel === 'CRITICAL') {
                    stats.spamBlocked.CRITICAL++;
                    spamDetails.push({
                        title: item.title.substring(0, 50),
                        reason: 'CRITICAL SPAM',
                        trustScore: trust.trustScore
                    });
                    return null;
                }
                
                // HARD BLOCK: High Spam + Niedriger Trust
                if (spamAnalysis.spamLevel === 'HIGH' && trust.trustScore < 30) {
                    stats.spamBlocked.HIGH++;
                    spamDetails.push({
                        title: item.title.substring(0, 50),
                        reason: `HIGH SPAM (Trust: ${trust.trustScore}/100)`,
                        trustScore: trust.trustScore
                    });
                    return null;
                }
                
                // HARD BLOCK: Extrem niedriges Trust
                if (trust.trustScore < 20) {
                    stats.lowTrustBlocked++;
                    spamDetails.push({
                        title: item.title.substring(0, 50),
                        reason: `LOW TRUST (${trust.trustScore}/100)`,
                        trustScore: trust.trustScore
                    });
                    return null;
                }
                
                // Domain extrahieren und Community-Votes anhängen
                let itemDomain = '';
                try { itemDomain = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase(); } catch(e) {}
                const communityVotes = votesMap.get(itemDomain) || { positive: 0, neutral: 0, negative: 0, total: 0 };

                return {
                    ...item,
                    spamAnalysis,
                    trust,
                    trustScore: trust.trustScore,
                    communityVotes
                };
            })
            .filter(item => item !== null);

        console.log(`   ✓ Verarbeitet: ${stats.totalProcessed}`);
        console.log(`   🚫 CRITICAL Spam: ${stats.spamBlocked.CRITICAL}`);
        console.log(`   ⚠️  HIGH Spam: ${stats.spamBlocked.HIGH}`);
        console.log(`   🔒 Low Trust: ${stats.lowTrustBlocked}`);
        console.log(`   ✅ Nach Phase 1: ${results.length} Kandidaten\n`);

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 2: RELEVANZ-BERECHNUNG
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`📍 PHASE 2: RELEVANZ-BERECHNUNG\n`);

        results = results.map(item => {
            const relevance = qualityMetrics.calculateRelevanceScore(
                item,
                query,
                { isNewsQuery, intent: effectiveIntent }
            );

            return {
                ...item,
                relevanceScore: relevance.relevanceScore,
                relevanceFactors: relevance.factors,
                relevanceReasons: relevance.reasonsForRanking,
                detectedIntent: relevance.searchIntent,
            };
        });

        console.log(`   ✓ Relevanz-Scores berechnet für ${results.length} Items\n`);

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 2.5: KEYWORD-RELEVANZ-FILTER (HART) + SYNONYM-MATCHING
        // Nur Seiten mit mindestens einem Suchbegriff kommen ins Ranking.
        // NEU: Auch Synonyme werden geprüft (z.B. "nachrichten" findet "news")
        // \b-Wort-Grenzen verhindern Substring-Treffer ("musk" ≠ "Muskel").
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`📍 PHASE 2.5: KEYWORD-RELEVANZ-FILTER (mit Synonym-Matching)\n`);

        // Stop-Wörter aus dem Keyword-Filter entfernen (gleiche Liste wie quality-metrics.js)
        const STOP_WORDS = new Set([
            'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'und', 'oder',
            'auf', 'aus', 'bei', 'bis', 'für', 'mit', 'nach', 'von', 'vor', 'zum',
            'zur', 'ins', 'ans', 'vom', 'hat', 'ist', 'sind', 'war', 'wird',
            'ich', 'wir', 'sie', 'ihr', 'man', 'sich', 'aber', 'auch', 'als',
            'wie', 'was', 'wer', 'dass', 'wenn', 'noch', 'nur', 'sehr', 'hier',
            'the', 'and', 'for', 'not', 'are', 'this', 'that', 'with', 'from'
        ]);
        const queryTerms = q.split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));
        console.log(`   📝 queryTerms nach Filter: ${JSON.stringify(queryTerms)}`);
        
        // 🆕 SYNONYM-EXPANSION für Phase 2.5
        // Für jeden Term auch seine Synonyme sammeln, damit multilingual gesucht wird
        const expandedTerms = new Set();
        console.log(`   🔧 synonymsModule vorhanden? ${!!synonymsModule}`);
        
        for (const term of queryTerms) {
            expandedTerms.add(term); // Original-Term
            // Nur Synonyme hinzufügen wenn das Modul geladen wurde
            if (synonymsModule) {
                try {
                    const synonyms = synonymsModule.getSynonyms(term);
                    console.log(`   └─ getSynonyms("${term}"): ${JSON.stringify(synonyms)}`);
                    synonyms.forEach(syn => expandedTerms.add(syn));
                } catch (e) {
                    console.log(`   └─ getSynonyms("${term}") ERROR: ${e.message}`);
                }
            }
        }
        console.log(`   🎯 Finale expandedTerms: ${JSON.stringify(Array.from(expandedTerms))}`);
        
        const beforeFilter = results.length;

        if (expandedTerms.size > 0) {
            // Original Query-Terme (ohne Synonyme) für Multi-Wort-Check
            const originalTerms = queryTerms;
            const isMultiWord   = originalTerms.length >= 2;

            results = results.filter(item => {
                const title    = (item.title    || '').toLowerCase();
                const content  = (item.content  || '').toLowerCase();
                const fulltext = (item.fulltext || '').toLowerCase();
                const urlText  = (item.url || '').toLowerCase().replace(/[-_.\/]/g, ' ');
                // Tags aus DB einbeziehen — lowercase wie alle anderen Felder
                // FIX BUG 4: ohne .toLowerCase() sind Tag-Matches case-sensitiv
                // {Benzin} würde "benzin"-Query nicht matchen
                let tagsText = '';
                if (Array.isArray(item.tags)) {
                    tagsText = item.tags.join(' ');
                } else if (typeof item.tags === 'string') {
                    // PostgreSQL-Array-Format "{benzin,elektroauto}" → "benzin elektroauto"
                    tagsText = item.tags.replace(/^\{|\}$/g, '').replace(/,/g, ' ');
                }
                const combined = title + ' ' + content + ' ' + fulltext + ' ' + urlText + ' ' + tagsText.toLowerCase();
                
                // Streng: ALLE Terme müssen vorkommen UND mind. 1 Term im Titel,
                // im fulltext (2×) ODER als Tag — verhindert zufällige Einzelnennungen.
                // FIX: Tags gelten als starkes Qualitätssignal (gleichwertig mit Titel)
                if (isMultiWord) {
                    const allPresent = originalTerms.every(term => {
                        const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        return new RegExp(`\\b${esc}\\b`, 'i').test(combined);
                    });
                    if (!allPresent) return false;

                    return originalTerms.some(term => {
                        const esc        = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const re         = new RegExp(`\\b${esc}\\b`, 'i');
                        const inTitle    = re.test(title);
                        const inFulltext = (fulltext.match(new RegExp(`\\b${esc}\\b`, 'gi')) || []).length >= 2;
                        // FIX BUG 2: Tags sind ein starkes Redaktions-Signal — ein Tag
                        // reicht als Nachweis (wie ein Titel-Match), kein Content-Schwellwert nötig
                        const inTags     = re.test(tagsText);
                        return inTitle || inFulltext || inTags;
                    });
                }

                // EINZEL-WORT MODUS (z.B. "news", "python", "auto", "benzin")
                // WICHTIG: Immer beidseitige Wortgrenzen \b...\b verwenden!
                // \bauto (ohne rechte Grenze) würde "automatisch", "Autor", "autorisiert"
                // matchen → falsche Treffer wie Bankgebühren, Datenschutz etc.
                //
                // Plural/Flexion: Wird über Synonym-Expansion gelöst (getSynonyms
                // sollte "autos" für "auto" liefern), NICHT über Regex-Stemming.
                //
                // Schwellwert 3 (war 2): filtert zufällige Einzelnennungen in
                // thematisch fremden Texten, lässt echte Artikel durch.
                // URL-Match entfernt: Domain-Namen wie "autoscout24" sind kein
                // inhaltlicher Relevanznachweis.
                //
                // FIX BUG 3: Tags werden wie Titel-Matches behandelt — ein exakter
                // Tag-Treffer ist ein stärkeres Signal als 3× im Fließtext, weil
                // Redakteure Tags bewusst als thematische Kategorisierung setzen.
                return Array.from(expandedTerms).some(term => {
                    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const re  = new RegExp(`\\b${esc}\\b`, 'i');
                    // Titel-Match reicht alleine
                    if (re.test(title)) return true;
                    // Tags-Match reicht alleine (explizit redaktionell vergeben)
                    if (re.test(tagsText)) return true;  // ← NEU
                    // Content/Fulltext: Mindest-Häufigkeit 3
                    const inContent  = (content.match(new RegExp(`\\b${esc}\\b`, 'gi')) || []).length >= 3;
                    if (inContent) return true;
                    const inFulltext = (fulltext.match(new RegExp(`\\b${esc}\\b`, 'gi')) || []).length >= 3;
                    return inFulltext;
                });
            });
        }

        stats.relevanceFiltered = beforeFilter - results.length;

        console.log(`   🔎 Query-Terms: ${queryTerms.join(' + ')}`);
        console.log(`   🔄 Mit Synonymen expandiert zu: ${Array.from(expandedTerms).join(' / ')}`);
        console.log(`   ✓ Mit Keyword-Match: ${results.length}`);
        console.log(`   ❌ Kein Keyword-Match: ${stats.relevanceFiltered} (im Index, erscheinen bei anderen Suchanfragen)\n`);

        // ════════════════════════════════════════════════════════════════════════════
        // BRAND-VORABERKENNUNG (vor Phase 3, damit Penalty korrekt gesetzt wird)
        // Erkennt ob die Suche auf eine bestimmte Marke/Domain abzielt.
        // Query-basiert um Zirkularität zu vermeiden (nicht Ergebnis-basiert).
        // ════════════════════════════════════════════════════════════════════════════
        const preHasDomainInQuery = /\.(de|com|org|net|at|ch|io|eu)\b/i.test(q);
        const preHasSiteOperator  = /^site:/i.test(q);
        let preIsBrandSearch = preHasDomainInQuery || preHasSiteOperator;

        if (!preIsBrandSearch) {
            // Dominante Domain aus aktuellen Ergebnissen ableiten
            const domainFreqPre = new Map();
            for (const r of results) {
                let d = '';
                try { d = new URL(r.url).hostname.replace(/^www\./, '').toLowerCase(); } catch(e) {}
                if (d) domainFreqPre.set(d, (domainFreqPre.get(d) || 0) + 1);
            }
            const [topDPre, topCountPre] = [...domainFreqPre.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
            if (topDPre && topCountPre >= 5) {
                const topDWord = topDPre.split('.')[0];
                if (topDWord.length >= 3 && q.split(/\s+/).some(w => w === topDWord)) {
                    preIsBrandSearch = true;
                }
            }
        }

        // PHASE 2.6: DATA-DRIVEN INTENT DETECTION (🆕 echte Such-Engine-Intelligenz!)
        // Anstatt nur Regex-Patterns zu prüfen, analysiert die Engine jetzt die
        // TATSÄCHLICHEN Ergebnisse und lernt den Intent aus den Kategorien.
        // 
        // Z.B.: User sucht "news" oder "nachichten"
        // → Regex erkennt intent als NEWS ✓
        // → Aber wenn nur Blog-Artikel im Index sind → Intent wird zu INFORMATIONAL ✓
        // → Das ist intelligenter als hardcoding!
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`📍 PHASE 2.6: DATA-DRIVEN INTENT DETECTION\n`);
        
        // Refiniere den Intent — aber NEWS/YMYL/NAVIGATION nie überschreiben!
        const PROTECTED_INTENTS = new Set(['NEWS', 'YMYL', 'NAVIGATION']);
        const refinedIntent = PROTECTED_INTENTS.has(searchIntent)
            ? searchIntent
            : qualityMetrics.detectIntentFromResults(results, searchIntent);
        
        if (refinedIntent !== searchIntent) {
            console.log(`   🔍 Kategorie-Analyse der Top 5 Ergebnisse:`);
            const topCategories = results.slice(0, 5)
                .map(r => r.category || r.type || 'unknown')
                .filter(Boolean);
            console.log(`      ${topCategories.join(' → ')}`);
            console.log(`   📊 Intent korrigiert: ${searchIntent} → ${refinedIntent}`);
            console.log(`   ⚙️  Neue Gewichte werden neu berechnet\n`);
            
            // Aktualisiere alle Intent-bezogenen Variablen
            searchIntent = refinedIntent;
            effectiveIntent = (intelligenceContext && intelligenceContext.finalIntent) || refinedIntent;
            isNewsQuery = effectiveIntent === 'NEWS';
            
            // Neue Gewichte für den verfeinerten Intent
            weights = getWeights(effectiveIntent, query);
        } else {
            console.log(`   ✓ Intent bestätigt: ${searchIntent} (konsistent mit Index-Daten)\n`);
        }

        // ════════════════════════════════════════════════════════════════════════════
        // REPUTATIONS-MAP (für Source-Reliability-Engine)
        // Enthält Trust-Scores + Community-Votes aller bekannten Domains.
        // Gebaut aus den gefilterten Ergebnissen PLUS globaler votesMap,
        // damit auch Domains bewertet werden, die nicht in den Ergebnissen sind.
        // ════════════════════════════════════════════════════════════════════════════
        const reputationMap = new Map();
        for (const item of results) {
            let rdomain = '';
            try { rdomain = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase(); } catch(e) {}
            if (rdomain) {
                reputationMap.set(rdomain, {
                    trustScore: item.trustScore,
                    votes: {
                        positive: (item.communityVotes && item.communityVotes.positive) || 0,
                        negative: (item.communityVotes && item.communityVotes.negative) || 0
                    }
                });
            }
        }
        // votesMap-Einträge hinzufügen (für Domains ohne eigenes Suchergebnis)
        for (const [rdomain, votes] of votesMap) {
            if (!reputationMap.has(rdomain)) {
                reputationMap.set(rdomain, {
                    trustScore: null,
                    votes: { positive: votes.positive || 0, negative: votes.negative || 0 }
                });
            }
        }

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 3: FINALE SCORE-BERECHNUNG — NORMALISIERTES 3-BUCKET-MODELL
        //
        // WARUM NORMALISIERT?
        // Das alte additive System (Basis 75 + Boni bis +70) ließ viele Signale
        // wirkungslos verpuffen weil der Score bereits bei 100 gecappt war.
        // Community-Vote +8? Irrelevant wenn Score schon 96 ist.
        //
        // DAS NEUE MODELL — 3 garantierte Buckets, Summe IMMER 0–100:
        //
        //   BUCKET A │ Trust          │ 0 bis weights.trust  Punkte  (z.B. 40)
        //   BUCKET B │ Relevanz       │ 0 bis weights.relev  Punkte  (z.B. 35)
        //   BUCKET C │ Qualität       │ 0 bis qualityBudget  Punkte  (z.B. 25)
        //
        //   qualityBudget = 100 − weights.trust − weights.relevance
        //
        //   → Bucket C wächst automatisch bei intent-abhängigen Gewichten:
        //     DEFAULT: quality = 25  (Trust 40 + Relevanz 35)
        //     NEWS:    quality = 40  (Trust 30 + Relevanz 30 → Freshness dominiert Quality)
        //     YMYL:    quality = 15  (Trust 60 + Relevanz 25 → Trust dominiert)
        //
        // QUALITÄTSSIGNALE (alle normalisiert 0.0–1.0, Gewichte summieren auf 1.0):
        //
        //   Signal        │ Gewicht │ Bedeutung
        //   ──────────────┼─────────┼───────────────────────────────────────────
        //   freshness     │  18%    │ Aktualität des Inhalts
        //   phrase        │  15%    │ Exakter Phrasentreffer (neu in quality-metrics)
        //   community     │  15%    │ Nutzer-Abstimmungen (approval rate)
        //   engagement    │  12%    │ CTR, Verweilzeit, Kommentare
        //   adFree        │  10%    │ Werbefreiheit + Affiliate-Dichte
        //   ux            │   8%    │ Mobile, Ladezeit, HTTPS
        //   structure     │   8%    │ Tabellen, Anleitungen, Bilder, Video
        //   authority     │   6%    │ Domain-Backlink-Stärke
        //   reliability   │   5%    │ Source-Reliability (Link-Nachbarschaft)
        //   semantic      │   3%    │ Synonym + Entitäten-Matching
        //   ──────────────┼─────────┼───────────────────────────────────────────
        //   SUMME         │ 100%    │
        //
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`📍 PHASE 3: FINALE SCORE-BERECHNUNG (normalisiertes 3-Bucket-Modell)\n`);
        console.log(`   Trust: ${weights.trust}% | Relevanz: ${weights.relevance}% | Qualität: ${100 - weights.trust - weights.relevance}% | Intent: ${effectiveIntent}\n`);

        // Qualitäts-Budget (passt sich per Intent-Gewicht automatisch an)
        const qualityBudget = Math.max(0, 100 - weights.trust - weights.relevance);

        // Gewichte der Qualitätssignale (Summe = 1.0)
        const QW = {
            freshness:   0.18,
            phrase:      0.15,
            community:   0.15,
            engagement:  0.12,
            adFree:      0.10,
            ux:          0.08,
            structure:   0.08,
            authority:   0.06,
            reliability: 0.05,
            semantic:    0.01,
            originality: 0.02,
        };

        results = results.map((item, idx) => {
            const bonuses   = {};
            const penalties = {};

            // ── BUCKET A: Trust (0 bis weights.trust) ────────────────────────────
            // Quadratische Skalierung: niedrige Werte werden stärker bestraft, hohe kaum
            const trustNorm       = item.trustScore / 100;
            const trustComponent  = (trustNorm * trustNorm) * weights.trust;

            // ── BUCKET B: Relevanz (0 bis weights.relevance) ─────────────────────
            const relNorm            = item.relevanceScore / 100;
            const relevanceComponent = (relNorm * relNorm) * weights.relevance;

            // ── BUCKET C: Qualitätssignale ────────────────────────────────────────
            // Jedes Signal wird auf 0.0–1.0 normalisiert.
            // 0.0 = schlechtester Wert, 1.0 = bester Wert.
            // Bidirektionale Signale: 0.0 = sehr negativ, 0.5 = neutral, 1.0 = sehr positiv.
            const sig = {};

            // ── Signal 1: FRESHNESS ───────────────────────────────────────────────
            {
                const pubDate = item.publishedDate || item.sitemapDate;
                if (pubDate) {
                    const ageDays = (Date.now() - new Date(pubDate).getTime()) / 86400000;
                    if      (ageDays <=   1) sig.freshness = 1.00;
                    else if (ageDays <=   3) sig.freshness = 0.90;
                    else if (ageDays <=   7) sig.freshness = 0.78;
                    else if (ageDays <=  30) sig.freshness = 0.60;
                    else if (ageDays <= 180) sig.freshness = 0.38;
                    else if (ageDays <= 365) sig.freshness = 0.18;
                    else                     sig.freshness = 0.04;
                } else {
                    sig.freshness = 0.50; // kein Datum = neutral
                }
                // News-Intent: Signal-Beitrag wird durch höheres qualityBudget schon verstärkt.
                // Zusätzlich: Breaking News leicht boosten
                if (isNewsQuery && sig.freshness >= 0.90) {
                    sig.freshness = Math.min(1, sig.freshness * 1.08);
                }
            }

            // ── Signal 2: PHRASE-MATCH ────────────────────────────────────────────
            // Kommt aus quality-metrics.js factors.phrase: -3 bis +15
            {
                const raw = (item.relevanceFactors && item.relevanceFactors.phrase) || 0;
                sig.phrase = Math.min(1, Math.max(0, (raw + 3) / 18));
                // -3=0.0 | 0=0.17 | +4=0.39 | +8=0.61 | +15=1.0
            }

            // ── Signal 3: COMMUNITY ───────────────────────────────────────────────
            // approval rate: 0.0 = alle negativ, 0.5 = neutral / keine Stimmen, 1.0 = alle positiv
            {
                const cv           = item.communityVotes || { positive: 0, neutral: 0, negative: 0, total: 0 };
                const decisiveVotes = cv.positive + cv.negative;
                if (cv.total < 5 || decisiveVotes === 0) {
                    sig.community = 0.50; // zu wenig Daten → neutral
                } else {
                    sig.community = cv.positive / decisiveVotes; // 0.0–1.0
                }
            }

            // ── Signal 4: ENGAGEMENT ─────────────────────────────────────────────
            {
                let eng = 0;
                // CTR (max 0.6)
                if      (item.ctr >= 8) eng += 0.60;
                else if (item.ctr >= 5) eng += 0.40;
                else if (item.ctr >= 2) eng += 0.20;
                // Verweilzeit (max 0.50)
                if      (item.dwellTime >= 3000) eng += 0.50;
                else if (item.dwellTime >= 1500) eng += 0.30;
                else if (item.dwellTime >=  500) eng += 0.10;
                // Kommentare (max 0.40)
                if      (item.commentCount >  50) eng += 0.40;
                else if (item.commentCount >  10) eng += 0.20;
                // Summe kann bis 1.5 → auf 1.0 normalisieren
                sig.engagement = Math.min(1, eng / 1.5);
            }

            // ── Signal 5: AD-FREE ─────────────────────────────────────────────────
            {
                const adCount = item.adCount || 0;
                if      (adCount === 0) sig.adFree = 1.00;
                else if (adCount === 1) sig.adFree = 0.75;
                else if (adCount === 2) sig.adFree = 0.50;
                else if (adCount === 3) sig.adFree = 0.28;
                else if (adCount === 4) sig.adFree = 0.10;
                else                   sig.adFree = 0.00;

                // Affiliate-Dichte-Malus einrechnen
                const affiliateMalus = adDensityMalus.calculateAffiliateDensityMalus(item);
                if (affiliateMalus.penalty > 0) {
                    sig.adFree = Math.max(0, sig.adFree - affiliateMalus.penalty / 20);
                }

                // Frust-Faktor (Werbung × Community-Dislikes kombiniert)
                const cv = item.communityVotes || { positive: 0, negative: 0 };
                const frustResult = adDensityMalus.calculateAdDensityMalus(item, {
                    positive: cv.positive,
                    negative: cv.negative
                });
                if (frustResult.penalty > 0) {
                    sig.adFree = Math.max(0, sig.adFree - frustResult.penalty / 25);
                }

                // adFree mit Relevanz skalieren: Werbefreie aber thematisch irrelevante
                // Seiten sollen keinen vollen adFree-Bonus bekommen.
                // Gestufte Deckelung:  < 30 → max 0.15 | < 40 → max 0.35 | ≥ 40 → voll
                if (item.relevanceScore < 30) {
                    sig.adFree = Math.min(0.15, sig.adFree);
                } else if (item.relevanceScore < 40) {
                    sig.adFree = Math.min(0.35, sig.adFree);
                }
            }

            // ── Signal 6: UX (Mobile + Ladezeit + HTTPS) ─────────────────────────
            {
                let ux = 0;
                if (item.isMobileFriendly === true) ux += 0.35;
                const loadMs = item.loadSpeed || item.loadTime || 0;
                if      (loadMs > 0   && loadMs <  800) ux += 0.45;
                else if (loadMs >= 800 && loadMs < 2000) ux += 0.25;
                else if (loadMs >= 2000 && loadMs < 3500) ux += 0.05;
                // Sehr langsam: UX negativ
                if (loadMs > 3500) ux -= 0.20;
                if (item.isSecure === true) ux += 0.20;
                sig.ux = Math.min(1, Math.max(0, ux));
            }

            // ── Signal 7: CONTENT STRUCTURE ──────────────────────────────────────
            {
                let str = 0;
                if (item.hasTable)                         str += 0.32;
                if (item.hasSteps)                         str += 0.32;
                if ((item.imageCount || 0) >= 5)           str += 0.18;
                if ((item.videoCount  || 0) > 0)           str += 0.18;
                if ((item.internalLinkDensity || 0) >= 0.1) str += 0.08;
                sig.structure = Math.min(1, str);
            }

            // ── Signal 8: DOMAIN AUTHORITY (dynamisch aus luma_domains) ─────────
            {
                let domainForAuth = '';
                try { domainForAuth = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase(); } catch(e) {}

                const trustData = domainTrustMap.get(domainForAuth);
                if (trustData) {
                    // vertrauen_gesamt: 0.0–1.0 direkt als Signal
                    // Spam-Malus einrechnen: hoher Spam → Authority runter
                    const spamMalus = (trustData.spam || 0) * 0.3;
                    sig.authority = Math.max(0, trustData.vertrauen - spamMalus);
                } else {
                    // Fallback: statische Domain Authority Liste
                    const authBonus = getDomainAuthorityBonus(domainForAuth);
                    sig.authority = Math.min(1, authBonus / 10);
                }
            }

            // ── Signal 9: SOURCE RELIABILITY ─────────────────────────────────────
            {
                const rel = sourceReliability.calculateReliabilityPenalty(item, reputationMap);
                const net = (rel.bonus || 0) - (rel.penalty || 0);
                // net: typisch -5 bis +5 → auf 0–1 normalisieren (0 bei -5, 0.5 bei 0, 1 bei +5)
                sig.reliability = Math.min(1, Math.max(0, (net + 5) / 10));
            }

            // ── Signal 10: SEMANTIC (KI-Embedding vorberechnet | Fallback: Synonyme) ──
            {
                if (semanticScoreMap.size > 0 && semanticScoreMap.has(item.url)) {
                    // KI-Score: vorberechnet in server.js via semantic-intelligence.js (0.0–1.0)
                    sig.semantic = semanticScoreMap.get(item.url);
                } else {
                    // Fallback: klassischer Synonym + Entitäten-Bonus (0–30 → 0.0–1.0)
                    const semBonus = getSemanticBonus(item, query);
                    sig.semantic = Math.min(1, semBonus / 30);
                }
            }

            // ── HARD FLAG: Produkt-Seite bei nicht-kommerziellem Intent ──────────
            // Kürzt das Quality-Budget auf 20% (statt komplett zu sperren).
            // Warum nicht -100%? Damit echte Produkt-Seiten bei kommerziellen
            // Umgebungs-Queries immer noch erscheinen können.
            let qualityMultiplier = 1.0;
            if (searchIntent !== 'COMMERCIAL' && !preIsBrandSearch) {
                const isProductPage = /\/products?\//i.test(item.url) || item.category === 'shop';
                if (isProductPage) {
                    qualityMultiplier = 0.20;
                    penalties.productMismatch = -Math.round(qualityBudget * 0.80);
                }
            }

            // ── INTELLIGENCE CONTEXT BONUS (5% des Quality-Budgets) ──────────────
            if (intelligenceContext.keywordFound) {
                sig.semantic = Math.min(1, sig.semantic + 0.15);
            }

            // ── Signal: ORIGINALITÄT (Copy-Paste-Detektor) ───────────────────────
            // item.originalityScore wird von server.js befüllt wenn article_similarity vorhanden
            if (item.originalityScore !== undefined) {
                sig.originality = Math.min(1, item.originalityScore / 100);
                // Originalquellen bekommen Bonus
                if (item.isOriginalSource) sig.originality = Math.min(1, sig.originality + 0.2);
            } else {
                sig.originality = 0.5; // Unbekannt → neutral
            }


            // Gewichteter Durchschnitt aller Signale × qualityBudget
            // Garantierter Bereich: 0 bis qualityBudget × qualityMultiplier
            let qualityWeightedSum = 0;
            for (const [key, weight] of Object.entries(QW)) {
                const v = Math.min(1, Math.max(0, sig[key] || 0));
                qualityWeightedSum += v * weight;
                // Boni/Penalties für Debug-Logging
                const contribution = Math.round(v * weight * qualityBudget * qualityMultiplier * 10) / 10;
                if (contribution >= 0.5) bonuses[key]   = contribution;
                else if (v < 0.30)        penalties[key] = contribution;
            }
            const qualityScore = qualityWeightedSum * qualityBudget * qualityMultiplier;

            // ── BONUS-DECKELUNG bei niedriger Relevanz ────────────────────────────
            const relevanceRaw = item.relevanceScore || 0;
            let qualityScoreFinal = qualityScore;
            if (relevanceRaw < 50)      qualityScoreFinal = Math.min(8, qualityScore);
            else if (relevanceRaw < 65) qualityScoreFinal = Math.min(12, qualityScore);
            // ── THEMEN-MISMATCH: Kategorie-basiert (category-mismatch.js) ────
            // Vergleicht item.kategorie aus DB mit Query-Intent.
            // Wartbar: neue Regeln nur in category-mismatch.js ändern.
            const mismatchResult  = getCategoryPenalty(query, item);
            const mismatchPenalty = mismatchResult.penalty;
            if (mismatchPenalty > 0) {
                penalties.topicMismatch = -mismatchPenalty;
            }

            // Pogo-Tracking: Qualitaets-Bonus/-Malus aus echten Nutzersignalen
            const pogoBonus  = urlQualitaetMap.get(item.url) || 0;

            // ── PERSONALISIERUNGS-BOOST ───────────────────────────────────────
            // userInterests kommt aus getUserInterests() in user-journey.js
            // und enthält die vom Nutzer gelikten Domains und Kategorien.
            //
            // Prinzip: Votes beeinflussen NUR das persönliche Ranking —
            // nicht global für alle. Wer Hip-Hop-Seiten liked, sieht
            // Hip-Hop-Seiten oben. Wer Rock-Seiten liked, sieht Rock oben.
            // Beide sehen andere Ergebnisse für dieselbe Suche.
            let personalisierungsBoost = 0;
            if (userInterests) {
                const itemDomain = (() => {
                    try { return new URL(item.url).hostname.replace(/^www\./, ''); }
                    catch { return ''; }
                })();

                // +15 wenn Nutzer diese exakte Domain bereits geliked hat
                // (stark genug um wirklich nach oben zu kommen)
                if (itemDomain && userInterests.likedDomains?.has(itemDomain)) {
                    personalisierungsBoost += 15;
                }

                // +5 wenn die Kategorie dieser Seite einer vom Nutzer
                // bevorzugten Kategorie entspricht (z.B. Nutzer liked viele
                // Tech-Seiten → andere Tech-Seiten bekommen auch Boost)
                if (item.category && userInterests.kategorien?.size > 0) {
                    const { inferKategorie } = require('./user-journey');
                    const itemKat = inferKategorie(itemDomain) || item.category;
                    const katFreq = userInterests.kategorien.get(itemKat) || 0;
                    if (katFreq >= 5) personalisierungsBoost += 5;
                    else if (katFreq >= 2) personalisierungsBoost += 3;
                }
            }

            const rawFinal   = trustComponent + relevanceComponent + qualityScoreFinal - mismatchPenalty + pogoBonus + personalisierungsBoost;
            const finalScore = Math.max(0, Math.min(100, Math.round(rawFinal)));

            // Community-Modifier für Abwärtskompatibilität (Phase 5 nutzt ihn noch)
            const communityModifier = Math.round((sig.community - 0.5) * 2 * QW.community * qualityBudget * qualityMultiplier * 10) / 10;

            // DEBUG: Score-Aufschlüsselung für Top 10
            if (idx < 10) {
                item._scoreDebug = {
                    trust:      Math.round(trustComponent * 10) / 10,
                    relevance:  Math.round(relevanceComponent * 10) / 10,
                    quality:    Math.round(qualityScore * 10) / 10,
                    budget:     qualityBudget,
                    signals:    Object.fromEntries(
                        Object.entries(sig).map(([k, v]) => [k, Math.round(v * 100) + '%'])
                    ),
                    aiBonus:    Math.round((sig.semantic || 0) * 100) + '% (KI-Score)',
                    final:      finalScore,
                };
            }

            return {
                ...item,
                finalScore,
                bonuses,
                penalties,
                isBestMatch:     false,
                trustBadge:      trustScore.getTrustBadge(item.trustScore),
                communityVotes:  item.communityVotes,
                communityModifier,
                _qualitySignals: sig,
                _qualityScore:   Math.round(qualityScore * 10) / 10,
            };
        });


        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 4: TAB-FILTERUNG
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`📍 PHASE 4: TAB-FILTERUNG\n`);
        const beforeTabFilter = results.length;
        
        if (activeTab === 'Bilder') {
            results = results.filter(item => item.image && item.image.length > 0);
            console.log(`   🖼️  Filter: Bilder | Ergebnisse: ${results.length}/${beforeTabFilter}\n`);
        } else if (activeTab === 'Videos') {
            results = results.filter(item => item.category === 'video' || (item.videoCount && item.videoCount > 0));
            console.log(`   🎬 Filter: Videos | Ergebnisse: ${results.length}/${beforeTabFilter}\n`);
        } else if (activeTab === 'Nachrichten') {
            results = results.filter(item => item.category === 'news');
            console.log(`   📰 Filter: Nachrichten | Ergebnisse: ${results.length}/${beforeTabFilter}\n`);
        } else {
            console.log(`   📄 Filter: Alle | Ergebnisse: ${results.length}\n`);
        }

        stats.finalResults = results.length;

        // ════════════════════════════════════════════════════════════════════════════
        // PAYWALL-PENALISIERUNG: URLs mit Paywall sollen nicht in Top 7 ranken
        // (MUSS VOR Sortierung sein!)
        // Berücksichtigt BEIDE Systeme:
        // - Nutzer-Meldungen (paywallMap aus luma_paywall_reports)
        // - Crawler-Erkennung (isPaywall/ist_paywall Felder)
        // ════════════════════════════════════════════════════════════════════════════
        {
            console.log(`\n🔒 PAYWALL-PENALISIERUNG (leichte Strafe):\n`);
            
            let paywallCount = 0;
            results = results.map(item => {
                let hasPaywall = false;
                let paywallSource = '';

                // 1. Crawler-erkannte Paywalls (isPaywall oder ist_paywall)
                if (item.isPaywall === true || item.ist_paywall === true) {
                    hasPaywall = true;
                    paywallSource = 'Crawler';
                }

                // 2. Nutzer-gemeldete Paywalls (Paywall-Radar-System)
                if (!hasPaywall && paywallMap && paywallMap.size > 0) {
                    try {
                        const domain = new URL(item.url).hostname.replace(/^www\./, '').toLowerCase();
                        if (paywallMap.get(domain) > 0) {
                            hasPaywall = true;
                            paywallSource = 'Nutzer-Radar';
                        }
                    } catch (e) {}
                }

                if (hasPaywall) {
                    // Subtile Strafe: -10 bis -15 Punkte (nicht -40!)
                    item.finalScore = Math.max(0, item.finalScore - 12);
                    item.hasPaywall = true;
                    item._paywallPenalty = true;
                    item._paywallSource = paywallSource;
                    paywallCount++;
                }
                return item;
            });

            console.log(`   • Paywalls erkannt: ${paywallCount}`);
            console.log(`   • Subtile Strafe angewendet: -12 Punkte pro Paywall\n`);
        }

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 5: SORTIERUNG NACH SCORE
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`📍 PHASE 5: SORTIERUNG\n`);
        console.log(`   Sortiere ${results.length} Ergebnisse nach finalScore (absteigend)\n`);
        
        results.sort((a, b) => b.finalScore - a.finalScore);

        // DOMAIN-DIVERSITÄT: Intent-basierte Limits via domain-diversity Modul v2.0
        // Brand-Erkennung: Query-basiert (NICHT Ergebnis-basiert), um Zirkularität zu vermeiden.
        // Domain-Familien: amazon.de + amazon.com = ein gemeinsamer Slot (getDiversityId).
        {
            const brandInfo     = domainDiversity.detectBrandSearch(query, results);
            const diversityOpts = domainDiversity.getOptionsForIntent(effectiveIntent);

            if (brandInfo.isBrand) {
                const topDomainWord = brandInfo.brandDomain.split('.')[0];
                console.log(`   🏷️  Brand-Suche erkannt: ${brandInfo.brandDomain} (${brandInfo.reason}) → kein Domain-Cap\n`);

                // Homepage-Boost: Root-URL der gesuchten Domain ganz nach oben
                results = results.map(item => {
                    try {
                        const parsed = new URL(item.url);
                        const isHomepage = (parsed.pathname === '/' || parsed.pathname === '') &&
                                           parsed.hostname.toLowerCase().includes(topDomainWord);
                        if (isHomepage) {
                            return { ...item, finalScore: Math.min(100, item.finalScore + 20), _homepageBoost: true };
                        }
                    } catch(e) {}
                    return item;
                });
                results.sort((a, b) => b.finalScore - a.finalScore);

                console.log(`   ✓ Domain-Diversität: ${results.length} Ergebnisse (Brand-Modus — kein Cap)\n`);
            } else {
                // Normale Suche: Intent-basierte Limits, Domain-Familien werden gruppiert
                const diversityResult = domainDiversity.applyDomainDiversity(results, diversityOpts);
                results = diversityResult.results;

                console.log(`   ✓ Domain-Diversität: ${results.length} Ergebnisse (max ${diversityOpts.maxPerDomainTop10}/Familie in Top 10 | Intent: ${effectiveIntent})\n`);
                if (results.length > 0) {
                    const diversityScore = domainDiversity.calculateDiversityScore(results);
                    console.log(`   📊 Diversity-Index: ${diversityScore.score} → ${diversityScore.level} (${diversityScore.uniqueDomains} einzigartigen Quellen)\n`);
                }
            }
        }

        // Mindest-Score-Filter: Ergebnisse unter 35 Punkten nicht anzeigen,
        // es sei denn der Index hat zu wenig Daten (< 5 Ergebnisse nach Filter).
        // Verhindert, dass 29-Punkte-Produktseiten
        // Ergebnissen erscheinen, wenn bessere Treffer vorhanden sind.
        const MIN_SCORE = 35;
        const filteredByScore = results.filter(r => r.finalScore >= MIN_SCORE);
        if (filteredByScore.length >= 3) {
            results = filteredByScore;
        }


        // Best Match (Featured Result) wenn Score > 65 und Trust > 70
        if (results.length > 0 && results[0].finalScore > 65 && results[0].trustScore > 70) {
            results[0].isBestMatch = true;
        }

        // ════════════════════════════════════════════════════════════════════════════
        // PHASE 6: TEXT-HIGHLIGHTING
        // ════════════════════════════════════════════════════════════════════════════
        console.log(`📍 PHASE 6: TEXT-HIGHLIGHTING\n`);
        
        const finalResults = results.map(item => ({
            ...item,
            title: highlightText(item.title, query),
            content: highlightText(item.content, query)
        }));

        console.log(`   ✓ Query-Terms hervorgehoben in Titeln & Content\n`);

        // ════════════════════════════════════════════════════════════════════════════
        // 🎯 FINAL RANKING REPORT
        // ════════════════════════════════════════════════════════════════════════════
        
        console.log(`\n${'█'.repeat(90)}`);
        console.log(`✅ RANKING COMPLETE - Finale Ergebnisse:`);
        console.log(`${'█'.repeat(90)}\n`);
        
        console.log(`📊 ZUSAMMENFASSUNG:`);
        console.log(`   Eingabe Items:           ${stats.totalProcessed}`);
        console.log(`   Spam CRITICAL blockiert: ${stats.spamBlocked.CRITICAL}`);
        console.log(`   Spam HIGH blockiert:     ${stats.spamBlocked.HIGH}`);
        console.log(`   Low Trust blockiert:     ${stats.lowTrustBlocked}`);
        console.log(`   Relevanz gefiltert:      ${stats.relevanceFiltered}`);
        console.log(`   ✅ Nach allen Filter:    ${finalResults.length} Ergebnisse\n`);
        
        // TOP 15 Results mit vollständigem Score-Breakdown
        console.log(`🏆 RANKING LISTE (Top 15):\n`);
        
        finalResults.slice(0, 15).forEach((item, i) => {
            // Score-Komponenten berechnen (mit dynamischen Gewichten)
            const trustComponent = Math.round(item.trustScore / 100 * weights.trust);
            const relComponent = Math.round(item.relevanceScore / 100 * weights.relevance);
            const bonusTotal = Object.values(item.bonuses || {}).reduce((a, b) => a + b, 0);
            const penaltyTotal = Object.values(item.penalties || {}).reduce((a, b) => a + b, 0);
            
            // Visualisierung des Score-Balkens
            const barLength = Math.round(item.finalScore / 100 * 40);
            const scoreBar = '█'.repeat(barLength) + '░'.repeat(40 - barLength);
            
            console.log(`\n┌─ ${i + 1}. ${item.isBestMatch ? '🌟 FEATURED' : '  '} - ${item.finalScore}/100 Punkte`);
            console.log(`│  Score: [${scoreBar}] ${item.finalScore}%`);
            console.log(`│`);
            console.log(`│  📌 ${item.title ? item.title.replace(/<[^>]*>/g, '').substring(0, 75) : 'N/A'}...`);
            console.log(`│  🔗 ${item.url}`);
            console.log(`│`);
            console.log(`│  📈 Components:`);
            console.log(`│     Trust (${weights.trust}%):       +${trustComponent} Pkt (Rohwert: ${item.trustScore}/100)`);
            console.log(`│     Relevance (${weights.relevance}%):    +${relComponent} Pkt (Rohwert: ${item.relevanceScore}/100)`);
            if (item._qualitySignals && item._qualitySignals.semantic > 0.1) {
                const kiPct = Math.round(item._qualitySignals.semantic * 100);
                const source = semanticScoreMap.has(item.url) ? 'KI-Embedding' : 'Synonyme/Entitäten';
                console.log(`│     Semantic:         ${kiPct}% (${source})`);
            }
            if (item.bonuses && item.bonuses.aiVector) {
                console.log(`│     🤖 AI Vector:     +${item.bonuses.aiVector} Pkt (Deep Semantic Match)`);
            }
            
            // Bonuses anzeigen
            if (bonusTotal > 0) {
                const bonusStr = Object.entries(item.bonuses)
                    .map(([k, v]) => `${k}(+${v})`)
                    .join(' + ');
                console.log(`│     Bonuses:      +${bonusTotal} Pkt [${bonusStr}]`);
            }
            
            // Penalties anzeigen
            if (penaltyTotal < 0) {
                const penaltyStr = Object.entries(item.penalties)
                    .map(([k, v]) => `${k}(${v})`)
                    .join(' + ');
                console.log(`│     Penalties:    ${penaltyTotal} Pkt [${penaltyStr}]`);
            }

            // Community-Modifier anzeigen
            const cv2 = item.communityVotes || { positive: 0, neutral: 0, negative: 0, total: 0 };
            if (cv2.total >= 5 && item.communityModifier !== 0) {
                const dir = item.communityModifier > 0 ? '+' : '';
                console.log(`│     Community:    ${dir}${item.communityModifier} Pkt (${cv2.positive}👍 ${cv2.neutral}😐 ${cv2.negative}👎 | ${cv2.total} Votes)`);
            } else if (cv2.total > 0) {
                console.log(`│     Community:    0 Pkt (${cv2.total} Votes — unter Schwellwert von 5)`);
            }
            
            // Metadata
            console.log(`│`);
            console.log(`│  🔍 Meta: Trust=${item.trustBadge.label} | Ads=${item.adCount || 0} | Comments=${item.commentCount || 0}`);
            
            if (item.relevanceReasons && item.relevanceReasons.length > 0) {
                console.log(`│  ✓ Why: ${item.relevanceReasons.join(' & ')}`);
            }
            
            console.log(`└${'─'.repeat(88)}`);
        });
        
        console.log(`\n${'█'.repeat(90)}\n`);

        return finalResults;
    }
};