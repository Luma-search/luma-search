/**
 * DB-Helfer: Datenbankzugriff und In-Memory-Cache für Luma
 * Enthält loadDatabase, searchQADatabase, searchDbForAutocomplete,
 * generateRelatedSearches und applyBlacklist.
 */

const dbModule  = require('../../crawler_new/db.js');
const { pool: sessionPool } = require('../../crawler_new/db.js');
const authManager = require('../../data/auth-manager');
const { escapeHtml, sanitizeUrl } = require('./output-helpers');

// ── In-Memory Cache (wird beim Start geladen, alle 5min aktualisiert) ──
let cachedDb = [];
let cacheLoadedAt = 0;
const DB_CACHE_TTL = 5 * 60 * 1000; // 5 Minuten

// ── Hilfsfunktionen für Mapping-Berechnungen ──────────────────────────

// Rating neu berechnen: differenzierter, 1.0–5.0 mit echter Spreizung
function recalcRating(row) {
    let score = 0;

    // Content-Qualität (0–2 Punkte)
    const wc = row.word_count || 0;
    if      (wc > 2000) score += 2.0;
    else if (wc > 1000) score += 1.5;
    else if (wc > 500)  score += 1.0;
    else if (wc > 200)  score += 0.5;

    // Readability (0–1 Punkt) — echter Wert aus DB
    const rdbl = row.readability_score || 0;
    score += (rdbl / 100); // max 1.0

    // E-A-T (0–1 Punkt)
    const eat = row.eat_score || 0;
    score += (eat / 100);  // max 1.0

    // Struktur-Bonus (0–0.5)
    if (row.has_table === true) score += 0.2;
    if (row.has_steps === true) score += 0.3;

    // Bilder-Bonus (0–0.3)
    if ((row.image_count || 0) > 5) score += 0.3;
    else if ((row.image_count || 0) > 2) score += 0.15;

    // Freshness-Malus: Artikel > 1 Jahr alt bekommen -0.5
    if (row.published_date) {
        const ageDays = (Date.now() - new Date(row.published_date)) / 86400000;
        if (ageDays > 365) score -= 0.5;
    }

    // Ads-Malus: Viele Ads → schlechtere Bewertung
    const adUrls = row.ad_url_count || 0;
    if (adUrls > 10) score -= 0.5;
    else if (adUrls > 5) score -= 0.2;

    // Auf 1.0–5.0 normalisieren (max erreichbar: ~5.1 → wird auf 5.0 gekappt)
    return parseFloat(Math.min(5.0, Math.max(1.0, score + 1.0)).toFixed(1));
}

// Ads aus mehreren Quellen kombinieren
function calcAdCount(row) {
    const domainAds = row.ad_count    || 0;
    const urlAds    = row.ad_url_count || 0;
    // Wenn CSS-Erkennung 0 gibt aber URL-Analyse Werbe-URLs findet → nutze diese
    if (domainAds === 0 && urlAds > 0) {
        // Grobe Schätzung: 5 Werbe-URLs ≈ 1 sichtbare Anzeige
        return Math.floor(urlAds / 5);
    }
    return domainAds;
}

/**
 * Lädt alle Seiten aus Postgres mit TTL-Cache
 */
async function loadDatabase() {
    const now = Date.now();
    if (cachedDb.length > 0 && (now - cacheLoadedAt) < DB_CACHE_TTL) {
        return cachedDb; // Cache HIT
    }

    try {
        const data = await dbModule.getAllPages({ limit: 100000 });

        // ── Supabase snake_case → camelCase mappen ──────────────────────────
        cachedDb = (data || []).map(row => ({
            // Basis
            url:                  row.url,
            canonicalUrl:         row.canonical_url || row.url,
            title:                row.meta_title || row.title || '',
            content:              row.meta_description || row.content || '',
            luma_meta_description: row.meta_description || '',
            fulltext:             row.fulltext || '',
            image:                (row.image && row.image.startsWith('http')) ? row.image : null,
            rating:               recalcRating(row),

            // Keywords
            keywords:             row.keywords || '',

            // Schema.org
            author:               row.author || null,
            publisher:            row.publisher || null,
            price:                row.price || null,
            currency:             row.currency || null,
            breadcrumb:           row.breadcrumb || [],
            faq:                  row.faq || [],
            articleSection:       row.article_section || null,

            // JSONB-Felder
            headings:             row.headings || [],
            entities:             row.entities || {},
            structuredData:       row.structured_data || {},

            // Qualitätssignale - mit INTELLIGENTEN DEFAULTS statt Nullen
            wordCount:            row.word_count || 0,
            adCount:              calcAdCount(row),
            adUrlCount:           0,
            adUrls:               [],
            domainTrust:          row.domain_trust || 0,
            domainAge:            row.domain_age || 365, // DEFAULT: 1 Jahr (kein "neue Domain" Malus)
            eatScore:             row.eat_score || 50, // DEFAULT: mittelmäßig (nicht 0!)
            readabilityScore:     row.readability_score || 60, // DEFAULT: lesbar
            ctr:                  0,
            dwellTime:            0,
            loadSpeed:            row.load_speed || 2.0, // DEFAULT: 2 Sekunden
            isMobileFriendly:     row.is_mobile_friendly !== false, // DEFAULT: true
            isSecure:             row.is_secure !== false, // DEFAULT: true
            outboundQuality:      true, // DEFAULT: true (gute externe Links)
            textToCodeRatio:      row.text_to_code_ratio || 0.8, // DEFAULT: 80% Text (nicht Spam-y)
            commentCount:         0,
            hasTable:             false,
            hasSteps:             false,
            schemaRating:         null,
            schemaRatingCount:    null,

            // Datum & Meta
            publishedDate:        row.published_date || null,
            sitemapDate:          null,
            imageCount:           row.image_count || 1, // DEFAULT: mindestens 1 Bild
            videoCount:           row.video_count || 0,
            internalLinkDensity:  0,
            avgWordLength:        row.avg_word_length || 5.5, // DEFAULT: Deutsche Durchschnittswortlänge
            avgSentenceLength:    row.avg_sentence_length || 12, // DEFAULT: 12 Wörter pro Satz
            language:             row.language || 'de',
            category:             row.category || 'news',
            kategorie:            row.kategorie || row.category || null,

            // 🔓 PAYWALL-FELDER aus Datenbank
            ist_paywall:          row.ist_paywall || false,
            isPaywall:            row.ist_paywall || false,
            paywall_confidence:   row.paywall_confidence || 0,
            paywallConfidence:    row.paywall_confidence || 0,
            paywall_typ:          row.paywall_typ || null,
            paywallTyp:           row.paywall_typ || null,
            paywall_grund:        row.paywall_grund || null,
            paywallGrund:         row.paywall_grund || null,

            // Aliase
            description:          row.meta_description || row.content || '',
            contentSnippet:       (row.meta_description || row.content || '').substring(0, 200),
        }));

        cacheLoadedAt = now;
        console.log(`✓ Lokale Postgres: ${cachedDb.length} Seiten geladen`);
        return cachedDb;

    } catch (err) {
        console.error('❌ Lokale Postgres loadDatabase Fehler:', err.message);
        return cachedDb;
    }
}

// ── Externe Antwort in luma_ai_answers cachen ───────────────────────────
async function saveQAAnswer(question, answer, source_url = null, source = null) {
    try {
        const q = question.trim().substring(0, 500);
        const a = answer.trim().substring(0, 5000);
        const src = source ? String(source).substring(0, 50) : null;
        
        // Duplikate vermeiden
        const existing = await sessionPool.query(
            `SELECT 1 FROM luma_ai_answers WHERE LOWER(question) = LOWER($1) LIMIT 1`,
            [q]
        );
        if (existing.rows.length > 0) return;
        
        // Speichere mit source (DDG, Wikipedia, Wikidata, etc.)
        await sessionPool.query(
            `INSERT INTO luma_ai_answers (question, answer, source_url, source, created_at) 
             VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [q, a, source_url, src]
        );
    } catch {
        // Nicht-kritisch – kein Crash wenn Speichern fehlschlägt
    }
}

// ── Direkte Q&A-Suche in luma_ai_answers ────────────────────────────────
async function searchQADatabase(query) {
    try {
        const stopwords = new Set([
            'der','die','das','dem','den','des','ein','eine','eines','einem','einen',
            'von','zu','in','auf','an','über','bei','seit','bis','mit','ohne','für',
            'gegen','nach','ab','beim','zum','zur','im','am','vom','ins','ans','ums',
            'und','oder','aber','denn','weil','dass','wenn','als','ob','damit','obwohl',
            'wie','was','wer','wo','wann','warum','woher','wieviel','ist','sind',
            'hat','haben','wurde','wird','worden',
            'größte','großes','größter','größtem','größten',
            'klein','kleinste','kleinster','kleinere','kleiner',
            'höchste','höchst','höchster','höchsta',
            'längste','längst','längster','längere','länger',
            'tiefste','tiefst','tiefster','tiefere','tiefer',
            'schnellste','schnellst','schnellster','schnellere','schneller',
            'neu','neuer','neueste','neuster','alt','alte','älteste','älterer',
            'bekannt','bekannte','bekannteste','bekanntester'
        ]);
        
        let terms = query.toLowerCase().trim().split(/\s+/)
            .filter(t => t.length > 2 && !stopwords.has(t));
        
        // EXAKT-Match hat Priorität
        const exactRes = await sessionPool.query(
            `SELECT question, answer, source_url AS url FROM luma_ai_answers
             WHERE LOWER(question) = LOWER($1) LIMIT 1`,
            [query]
        );
        if (exactRes.rows.length > 0) return exactRes.rows;
        
        if (!terms.length) {
            // Fallback: nutze Original-Query wenn alle Stopwords
            terms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 3);
        }
        if (!terms.length) return [];
        
        // Suche mit OR: mind. EIN Begriff muss passen (bessere Treffer)
        const conditions = terms.map((_, i) =>
            `(LOWER(question) LIKE $${i + 1} OR LOWER(answer) LIKE $${i + 1})`
        ).join(' OR ');
        const params = terms.map(t => `%${t}%`);
        const result = await sessionPool.query(
            `SELECT question, answer, source_url AS url
             FROM   luma_ai_answers
             WHERE  ${conditions}
             ORDER  BY LENGTH(answer) ASC
             LIMIT  5`,
            params
        );
        return result.rows;
    } catch {
        return [];
    }
}

// ── In-Memory-Suche im cachedDb (für ai_autocomplete / product_autocomplete) ──
function searchDbForAutocomplete(query, limit = 5) {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (!terms.length || !cachedDb.length) return [];
    // Wortgrenzen: "alte" soll nicht "erhalten" oder "enthalten" matchen
    const termRegexes = terms.map(t =>
        new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i')
    );
    return cachedDb
        .filter(item => {
            if (!item.title) return false;
            return termRegexes.every(r => r.test(item.title));
        })
        .sort((a, b) => ((b.trustScore || b.domainTrust || 0) - (a.trustScore || a.domainTrust || 0)))
        .slice(0, limit)
        .map(item => ({
            // Auch Autocomplete-Daten müssen gesäubert werden!
            title:       escapeHtml(item.title || ''),
            question:    escapeHtml(item.title || ''),
            description: escapeHtml(((item.contentSnippet || item.description || item.content || '')
                            .replace(/<[^>]*>/g, '').trim()).substring(0, 140)),
            url:         sanitizeUrl(item.url || ''),
            domain:      escapeHtml(item.domain || '')
        }));
}

// ── Verwandte Suchanfragen aus Query-Logs ────────────────────────────────────
// Zeigt echte Suchanfragen anderer Nutzer die thematisch verwandt sind.
// Fallback: einfache Keyword-Kombination wenn keine Log-Daten vorhanden.
async function generateRelatedSearches(query, topResults) {
    // 1. Echte Query-Logs aus suchprotokoll
    try {
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        if (terms.length === 0) throw new Error('keine terms');

        // Suche nach Queries die ähnliche Begriffe enthalten
        // aber nicht identisch mit der aktuellen Query sind
        const conditions = terms.map((_, i) => `query ILIKE $${i + 2}`).join(' OR ');
        const params = [query, ...terms.map(t => `%${t}%`)];

        const res = await sessionPool.query(`
            SELECT query, COUNT(*) as n
            FROM suchprotokoll
            WHERE timestamp > NOW() - INTERVAL '30 days'
              AND LOWER(query) != LOWER($1)
              AND LENGTH(query) BETWEEN 3 AND 60
              AND query NOT ILIKE '%passwort%'
              AND query NOT ILIKE '%password%'
              AND (${conditions})
            GROUP BY query
            ORDER BY n DESC
            LIMIT 8
        `, params);

        if (res.rows.length >= 3) {
            return res.rows
                .map(r => r.query.trim())
                .filter(q => q.toLowerCase() !== query.toLowerCase())
                .slice(0, 6);
        }
    } catch { /* Fallback */ }

    // 2. Fallback: Sinnvolle Ergänzungen basierend auf Query-Typ
    const q = query.toLowerCase().trim();
    const suggestions = [];

    // News-Queries
    if (q.includes('news') || q.includes('nachricht') || q.includes('aktuell')) {
        const topic = q.replace(/news|nachrichten|aktuell/g, '').trim();
        if (topic) {
            suggestions.push(`${topic} heute`);
            suggestions.push(`${topic} aktuell`);
            suggestions.push(`${topic} 2025`);
        }
    }
    // Allgemeine Query-Erweiterungen
    else {
        const modifiers = ['aktuell', 'heute', 'news', 'erklärung', 'was ist'];
        for (const mod of modifiers) {
            if (!q.includes(mod)) {
                suggestions.push(`${q} ${mod}`);
                if (suggestions.length >= 4) break;
            }
        }
    }

    return suggestions.slice(0, 6);
}

/**
 * Filtert geblockte Domains aus den Suchergebnissen eines Nutzers.
 * Der Cache enthält ungefilterte Ergebnisse — Blacklist wird pro Request angewendet.
 */
async function applyBlacklist(response, userId) {
    if (!userId) return response;
    try {
        const blacklist = await authManager.getBlacklist(userId);
        if (!blacklist.length) return response;

        // Set mit normalisierten Domains (ohne www.)
        const blocked = new Set(blacklist.map(e => e.url_muster.toLowerCase().replace(/^www\./, '')));

        const filteredResults = response.results.filter(r => {
            if (!r.url || r.url === '#') return true; // Instant Answers behalten
            try {
                const host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '');
                return !blocked.has(host);
            } catch {
                return true;
            }
        });

        return { ...response, results: filteredResults };
    } catch {
        return response; // Bei Fehler ungefiltert zurückgeben
    }
}

/**
 * Wenn der Nutzer eine Whitelist hat UND sie aktiviert hat,
 * werden NUR Ergebnisse von diesen Domains angezeigt.
 */
async function applyWhitelist(response, userId) {
    if (!userId) return response;
    try {
        // Erst prüfen ob Whitelist-Filter vom Nutzer eingeschaltet ist
        const prefRes = await sessionPool.query(
            `SELECT einstellungen->>'whitelist_aktiv' AS active FROM nutzer WHERE id = $1`,
            [userId]
        );
        if (prefRes.rows[0]?.active !== 'true') return response; // Schalter aus → kein Filter

        const whitelist = await authManager.getWhitelist(userId);
        if (!whitelist.length) return response;

        const allowed = new Set(whitelist.map(e => e.url_muster.toLowerCase().replace(/^www\./, '')));

        const filteredResults = response.results.filter(r => {
            if (!r.url || r.url === '#') return true; // Instant Answers immer zeigen
            try {
                const host = new URL(r.url).hostname.toLowerCase().replace(/^www\./, '');
                return allowed.has(host);
            } catch {
                return true;
            }
        });

        return { ...response, results: filteredResults };
    } catch {
        return response;
    }
}

// Beim Start sofort laden
loadDatabase().catch(err => console.error('Startup DB load failed:', err.message));

// Cache alle 5 Minuten automatisch zurücksetzen
setInterval(() => {
    cacheLoadedAt = 0; // TTL ablaufen lassen → nächster Request lädt neu
}, DB_CACHE_TTL);

module.exports = {
    loadDatabase,
    searchQADatabase,
    saveQAAnswer,
    searchDbForAutocomplete,
    generateRelatedSearches,
    applyBlacklist,
    applyWhitelist
};