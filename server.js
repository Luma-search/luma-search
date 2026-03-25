/**
 * LUMA INTELLIGENCE - Server Premium v2.0 SECURITY EDITION
 * Hochperformance-Suchmaschinen-Backend mit HTTPS + Security
 * Features: HTTPS, Rate-Limiting, Input-Sanitization, Security-Headers, Compression, Caching
 */

const path = require('path');

// Environment Variables zuerst laden, damit DB-Verbindungen (in importierten Modulen) Zugriff darauf haben
// Wir erzwingen den Pfad zur .env Datei, damit sie auch gefunden wird, wenn der Server von woanders gestartet wird
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const fs = require('fs');
const compression = require('compression');
const https = require('https');

// Security Module
const securityConfig = require('./config/security-config');
const { globalLimiter } = require('./config/rate-limiter');
const { setupHTTPS, createHTTPSServer, securityHeadersMiddleware, hstsMiddleware, httpsRedirect } = require('./config/https-setup');
const {
    validateInput,
    xssProtectionMiddleware,
    inputValidationMiddleware,
    apiKeyValidationMiddleware,
    corsMiddleware,
    sqlInjectionProtectionMiddleware,
    securityLoggingMiddleware
} = require('./config/security-middleware');

// Module
const calculator = require('./modules/calculator/calculator');
const { convertCurrency } = require('./modules/currency_converter/currency_converter');
const votesManager   = require('./data/votes-manager');
const paywallManager = require('./data/paywall-manager');
const LumaCleaner    = require('./luma-cleaner/cleaner-logic');
const semanticAI     = require('./algorithmus/intelligence/semantic-intelligence');

// Auth
const session        = require('express-session');
const pgSession      = require('connect-pg-simple')(session);

// Hintergrund-Jobs
const { initAllCronJobs } = require('./cron');

// Helpers & Middleware
const requireAuth = require('./server/middleware/requireAuth');
const { loadDatabase, searchDbForAutocomplete, searchQADatabase, saveQAAnswer } = require('./server/helpers/db-helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// ─── PAYWALL RADAR FIX (Muss GANZ OBEN stehen) ─────────────────────────────
// Definiert die Route VOR allen Security-Middlewares, um Blockaden/Redirects zu verhindern.
app.get('/paywall-radar.html', (_req, res) => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Strict-Transport-Security'); // WICHTIG: HSTS für Iframe deaktivieren
    // Erlaubt das Laden im Iframe (frame-ancestors 'self')
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://geocoding-api.open-meteo.com https://api.open-meteo.com https://cdn.jsdelivr.net; frame-ancestors 'self';");
    res.sendFile(path.join(__dirname, 'public', 'paywall-radar.html'));
});

// Social Hub: iframe erlauben
app.get('/social-hub.html', (_req, res) => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; frame-ancestors 'self';"); // ← ws: wss: NEU
    res.sendFile(path.join(__dirname, 'public', 'social-hub.html'));
});
// ───────────────────────────────────────────────────────────────────────────

// Collection Category: iframe erlauben + Google Favicons
app.get('/collection-category.html', (_req, res) => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Strict-Transport-Security');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://www.google.com https://*.gstatic.com; connect-src 'self'; frame-ancestors 'self';");
    res.sendFile(path.join(__dirname, 'public', 'collection-category.html'));
});

// Collection Manager: iframe erlauben
app.get('/collection-manager.html', (_req, res) => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Strict-Transport-Security');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'self';");
    res.sendFile(path.join(__dirname, 'public', 'collection-manager.html'));
});

// ============================================================
// MIDDLEWARE
// ============================================================

// 1. Security Headers (immer zuerst!)
app.use(securityHeadersMiddleware);
// app.use(hstsMiddleware); // Für lokale Entwicklung deaktiviert, um "Connection Refused" bei iFrames zu vermeiden.
                          // HSTS zwingt den Browser zu HTTPS, aber der lokale Server läuft auf HTTP.
                          // Für die Live-Version muss das wieder aktiviert werden!

// 🛡️ Content Security Policy (CSP) - Der "zweite Sicherheitsgurt"
// Verhindert das Laden von bösartigen Skripten/Styles von fremden Quellen
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " + // 'unsafe-inline' erlaubt Inline-Skripte, CDN für Chart.js
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "img-src 'self' data: https: http:; " +
        "font-src 'self' data: https://fonts.gstatic.com; " +
        "connect-src 'self' https://*.wikipedia.org https://www.wikidata.org https://geocoding-api.open-meteo.com https://api.open-meteo.com https://cdn.jsdelivr.net; " +
        "frame-src 'self'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self';"
    );
    next();
});

// 2. CORS
app.use(corsMiddleware);

// 3. Body Parser (JSON für POST-Requests)
app.use(express.json({ limit: '10kb' })); // Max 10KB
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// 3b. Session (Auth)
// In Variable gespeichert damit sie an Socket.io (hub.js) übergeben werden kann
const { pool: sessionPool } = require('./crawler_new/db.js');
const sessionMiddleware = session({
    store: new pgSession({
        pool: sessionPool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || 'luma-secret-key-bitte-aendern',
    resave: false,
    saveUninitialized: false,
    rolling: true, // Cookie-Ablauf bei jeder Anfrage erneuern (Inaktivitäts-Timeout)
    cookie: {
        // Kein globales maxAge — Standard ist Session-Cookie (endet bei Browser-Schließung)
        // Bei "Angemeldet bleiben" wird maxAge im Login-Handler gesetzt
        httpOnly: true,
        sameSite: 'lax',
        secure: false // auf true setzen wenn HTTPS aktiv
    }
});
app.use(sessionMiddleware);

// 4. Compression (Daten komprimieren vor Übertragung)
app.use(compression());

// 5. Trust Proxy (für korrekte IP-Erkennung hinter Reverse Proxy)
app.set('trust proxy', 1);

// 6. Security - Input Validation & Sanitization (VOR Logik)
app.use(sqlInjectionProtectionMiddleware);
app.use(xssProtectionMiddleware);
app.use(inputValidationMiddleware);

// 🆕 LUMA CLEANER MIDDLEWARE (Die "Waschstraße" für Tracker & Inputs)
app.use((req, res, next) => {
    // 1. Cleaner global verfügbar machen
    app.locals.lumaCleaner = LumaCleaner;

    // 2. Automatische Query-Wäsche für Suchanfragen (?q=...)
    if (req.query && req.query.q) {
        req.query.q = LumaCleaner.washQuery(req.query.q);
    }
    next();
});

// 7. Rate Limiting (mit Global Limiter für alle Routes)
app.use(globalLimiter);

// 8. Request-Logging + Security Logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (req.path.includes('/search') || req.path.includes('/autocomplete')) {
            console.log(`${res.statusCode} ${req.method} ${req.path} +${duration}ms [IP: ${req.ip}]`);
        }
    });
    next();
});
app.use(securityLoggingMiddleware);

// ============================================================
// STATISCHE DATEIEN
// ============================================================

// Trust-Dashboard: für alle sichtbar, aber Abstimmen erfordert Login (Client-seitig)
app.get('/trust.html', (_req, res) => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.sendFile(path.join(__dirname, 'public', 'trust.html'));
});

// Trust-Popup: für alle sichtbar, aber Abstimmen erfordert Login (Client-seitig)
app.get('/trust-popup.html', (_req, res) => {
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(__dirname, 'public', 'trust-popup.html'));
});

// Persönliche URL-Blacklist: nur für angemeldete Nutzer
app.get('/my-blacklist.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'my-blacklist.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/navigations_tabs', express.static(path.join(__dirname, 'navigations_tabs')));
app.use('/setting', express.static(path.join(__dirname, 'setting')));
app.use('/modules/trust', express.static(path.join(__dirname, 'modules', 'trust')));
app.use('/modules/wetter', express.static(path.join(__dirname, 'modules', 'wetter')));
app.use('/modules/passwort', express.static(path.join(__dirname, 'modules', 'passwort')));
app.use('/autocomplete', express.static(path.join(__dirname, 'autocomplete')));

app.get('/setting', (req, res) => {
    res.sendFile(path.join(__dirname, 'setting', 'setting.html'));
});

// ============================================================
// ADMIN DASHBOARD
// ============================================================

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ── QueryTrendEngine für Self-Learning Autocomplete ──
const { pool, search } = require('./crawler_new/db.js');
const QueryTrendEngine = require('./autocomplete/server/queryTrendEngine');
const queryTrendEngine = new QueryTrendEngine(pool);

// Utility für Client-IP-Erkennung
const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
           req.socket.remoteAddress ||
           '127.0.0.1';
};

// ── Autocomplete Routen (modular) ──
require('./autocomplete/server/index')(app, {
    loadDatabase,
    calculator,
    convertCurrency,
    // 🧼 Automatische Wäsche für Autocomplete-Inputs
    searchDbForAutocomplete: (q, limit) => searchDbForAutocomplete(LumaCleaner.washQuery(q), limit),
    searchQADatabase,
    saveQAAnswer,
    queryTrendEngine,
    getClientIp,
    lumaCleaner: LumaCleaner,
    pool,
});

// ── Paywall-API ───────────────────────────────────────────────────────────
// Diese Route verarbeitet die Meldungen aus paywall-radar.html
app.post('/api/paywall', requireAuth, async (req, res) => {
    const { url } = req.body;
    const reporterId = req.session.userId; // `requireAuth` stellt sicher, dass dies existiert

    try {
        // Die Logik ist jetzt im paywallManager gekapselt
        const result = await paywallManager.reportUrl(url, reporterId);
        res.json(result);
    } catch (err) {
        if (err.message.includes('Ungültige URL')) {
            return res.status(400).json({ success: false, error: err.message });
        }
        // ON CONFLICT wird im Manager behandelt, aber andere DB-Fehler könnten auftreten
        console.error('Paywall report error:', err);
        res.status(500).json({ success: false, error: 'Serverfehler beim Melden der Paywall.' });
    }
});

// ── URL-Normalisierungsfunktion ─────────────────────────────────────────────
function normalizeUrlForComparison(urlStr) {
    if (!urlStr) return '';
    try {
        // Parse URL
        const u = new URL(urlStr);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        let path = u.pathname.replace(/\/+$/, '') || '/';
        return `${host}${path}`.toLowerCase();
    } catch (e) {
        // Fallback für ungültige URLs
        return urlStr
            .toLowerCase()
            .replace(/^https?:\/\/(www\.)?/, '')
            .replace(/\/$/, '');
    }
}

// ── /api/articles-with-facts — Liefert Artikel-URLs mit Fakten ───────────
app.get('/api/articles-with-facts', async (req, res) => {
    try {
        // Lade alle eindeutigen URLs mit Fakten aus der DB
        const result = await pool.query(`
            SELECT DISTINCT 
                COALESCE(nf.url, lhi.url) AS url,
                COUNT(*) as fact_count,
                MAX(CASE WHEN nf.kategorie = '_zusammenfassung' THEN 1 ELSE 0 END) as has_summary
            FROM nachrichten_fakten nf
            LEFT JOIN luma_haupt_index lhi ON lhi.id = nf.web_id
            WHERE COALESCE(nf.url, lhi.url) IS NOT NULL
            GROUP BY COALESCE(nf.url, lhi.url)
            ORDER BY has_summary DESC, fact_count DESC
        `);

        console.log('[/api/articles-with-facts] URLs mit Fakten geladen:', result.rows.length);
        
        const urls = result.rows.map(row => ({
            url: row.url,
            factCount: parseInt(row.fact_count),
            hasSummary: row.has_summary === 1
        }));
        
        res.json(urls);
    } catch (err) {
        console.error('Fehler bei /api/articles-with-facts:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── /api/facts-summaries-by-domain — ALLE Fakten per Domain ──────────
// Query: ?domains=spiegel.de,faz.net (TOP 10 URLs pro Domain mit ALLEN Fakten!)
app.get('/api/facts-summaries-by-domain', async (req, res) => {
    const domainsParam = (req.query.domains || '').trim();
    if (!domainsParam) return res.json([]);

    const domains = domainsParam.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    if (domains.length === 0) return res.json([]);

    try {
        // Lade TOP 10 URLs pro Domain (mit ALLEN ihren Fakten!)
        const query = `
            WITH top_urls AS (
                SELECT 
                    COALESCE(nf.url, lhi.url) AS url,
                    ROW_NUMBER() OVER (
                        PARTITION BY split_part(COALESCE(nf.url, lhi.url), '/', 3)
                        ORDER BY MAX(nf.erzeugt_am) DESC NULLS LAST
                    ) as rn
                FROM nachrichten_fakten nf
                LEFT JOIN luma_haupt_index lhi ON lhi.id = nf.web_id
                WHERE 
                    COALESCE(nf.url, lhi.url) IS NOT NULL
                    AND (${domains.map((_, i) => `COALESCE(nf.url, lhi.url) LIKE $${i + 1}`).join(' OR ')})
                GROUP BY COALESCE(nf.url, lhi.url)
            )
            SELECT 
                nf.fakt_inhalt,
                nf.quelle,
                nf.kategorie,
                COALESCE(nf.url, lhi.url) AS url
            FROM nachrichten_fakten nf
            LEFT JOIN luma_haupt_index lhi ON lhi.id = nf.web_id
            JOIN top_urls tu ON COALESCE(nf.url, lhi.url) = tu.url
            WHERE tu.rn <= 10
            ORDER BY COALESCE(nf.url, lhi.url), CASE WHEN nf.kategorie = '_zusammenfassung' THEN 0 ELSE 1 END, nf.erzeugt_am DESC
        `;

        // Prepare query params mit LIKE wildcards
        const params = domains.map(d => `%${d}%`);
        
        const result = await pool.query(query, params);

        console.log(`[/api/facts-summaries] ${domains.length} Domains → ${result.rows.length} Fakten (alle von Top 10 URLs)`);
        res.json(result.rows);
    } catch (err) {
        console.error('Fehler bei /api/facts-summaries-by-domain:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── /api/latest-news-with-facts — Neueste Artikel MIT Zusammenfassung ──
app.get('/api/latest-news-with-facts', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 3, 10);
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(nf.url, lhi.url) AS url,
                lhi.titel AS title,
                split_part(regexp_replace(COALESCE(nf.url, lhi.url), 'https?://(www\.)?', ''), '/', 1) AS domain,
                lhi.veroeffentlicht_am AS date,
                lhi.vorschaubild AS image,
                nf.erzeugt_am
            FROM nachrichten_fakten nf
            INNER JOIN luma_haupt_index lhi ON lhi.id = nf.web_id
            WHERE
                nf.kategorie = '_zusammenfassung'
                AND lhi.titel IS NOT NULL
                AND lhi.titel != ''
                AND lhi.titel NOT LIKE '%Men%Suchen%'
                AND nf.erzeugt_am >= NOW() - INTERVAL '24 hours'
            ORDER BY RANDOM()
            LIMIT $1
        `, [limit]);

        let rows = result.rows.filter(r => r.url);

        // Fallback: letzte 7 Tage wenn 24h zu wenig
        if (rows.length < limit) {
            const fallback = await pool.query(`
                SELECT
                    COALESCE(nf.url, lhi.url) AS url,
                    lhi.titel AS title,
                    split_part(regexp_replace(COALESCE(nf.url, lhi.url), 'https?://(www\.)?', ''), '/', 1) AS domain,
                    lhi.veroeffentlicht_am AS date,
                    lhi.vorschaubild AS image,
                    nf.erzeugt_am
                FROM nachrichten_fakten nf
                INNER JOIN luma_haupt_index lhi ON lhi.id = nf.web_id
                WHERE
                    nf.kategorie = '_zusammenfassung'
                    AND lhi.titel IS NOT NULL AND lhi.titel != ''
                    AND nf.erzeugt_am >= NOW() - INTERVAL '7 days'
                ORDER BY RANDOM()
                LIMIT $1
            `, [limit]);
            rows = fallback.rows.filter(r => r.url);
        }

        // Dedupliziere
        const seen = new Set();
        const unique = [];
        for (const row of rows) {
            if (seen.has(row.url)) continue;
            seen.add(row.url);
            unique.push(row);
            if (unique.length >= limit) break;
        }

        console.log(`[/api/latest-news-with-facts] ${unique.length} Artikel mit Zusammenfassung`);
        res.json(unique);
    } catch (err) {
        console.error('Fehler bei /api/latest-news-with-facts:', err);
        res.status(500).json([]);
    }
});

// ── /api/facts — KI-Fakten für sichtbare Artikel-URLs ──────────────────────
app.get('/api/facts', async (req, res) => {
    const urlsParam = (req.query.urls || '').trim();
    if (!urlsParam) return res.json([]);

    const urls = urlsParam.split(',').map(u => decodeURIComponent(u)).filter(Boolean);
    if (urls.length === 0) return res.json([]);

    try {
        // Dedupliziere URLs
        const uniqueUrls = [...new Set(urls)];

        console.log('[/api/facts] Suche Fakten für', uniqueUrls.length, 'URLs');
        console.log('[/api/facts] URLs:', uniqueUrls.slice(0, 3));

        // Erzeuge beide Varianten jeder URL: mit und ohne www.
        const urlVariants = [];
        for (const url of uniqueUrls) {
            urlVariants.push(url);
            if (url.includes('://www.')) {
                urlVariants.push(url.replace('://www.', '://'));  // ohne www
            } else {
                urlVariants.push(url.replace('://', '://www.'));  // mit www
            }
        }
        const deduped = [...new Set(urlVariants)];

        // SQL-Abfrage: URL-Match mit normalisierten URLs (ohne Query-Parameter, ohne trailing slash)
        const normalizeUrl = u => u.replace(/[?#].*$/, '').replace(/\/+$/, '').replace('://www.', '://');
        const normalizedVariants = [...new Set(deduped.map(normalizeUrl))];
        const placeholders = normalizedVariants.map((_, i) => `$${i + 1}`).join(', ');
        
        let result = { rows: [] };
        try {
            result = await pool.query(`
                SELECT 
                    nf.fakt_inhalt,
                    nf.fakt_label,
                    nf.quelle,
                    nf.kategorie,
                    COALESCE(nf.url, lhi.url) AS url,
                    ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(nf.url, lhi.url),
                            CASE
                                WHEN nf.kategorie = '_zusammenfassung'   THEN 0
                                WHEN nf.kategorie = '_naechste_schritte' THEN 2
                                ELSE 1
                            END
                        ORDER BY nf.erzeugt_am DESC
                    ) as rn
                FROM nachrichten_fakten nf
                LEFT JOIN luma_haupt_index lhi ON lhi.id = nf.web_id
                WHERE regexp_replace(regexp_replace(COALESCE(nf.url, lhi.url), '[?#].*$', ''), '/(\s*)$|://www\.', '://', 'g')
                      IN (${placeholders})
            `, normalizedVariants);
        } catch (dbErr) {
            // Tabelle nachrichten_fakten existiert nicht (altes System)
            console.log('[/api/facts] Tabelle nachrichten_fakten nicht vorhanden (altes System gelöscht)');
            result = { rows: [] };
        }

        // Sonderkategorien immer mitnehmen, normale Fakten max. 7 pro URL
        const filtered = result.rows.filter(row =>
            row.kategorie === '_zusammenfassung'   ||
            row.kategorie === '_naechste_schritte' ||
            row.rn <= 7
        );

        // Sortiere: Zusammenfassung → Fakten → Nächste Schritte
        const sortOrder = k => k === '_zusammenfassung' ? 0 : k === '_naechste_schritte' ? 2 : 1;
        filtered.sort((a, b) => sortOrder(a.kategorie) - sortOrder(b.kategorie));

        console.log('[/api/facts]', filtered.length, 'Fakten gefunden für', uniqueUrls.length, 'URLs');

        res.json(filtered);
    } catch (err) {
        console.error('Fehler bei /api/facts:', err);
        res.status(500).json({ error: err.message });
    }
});

// ── /api/similarity — Ähnlichkeits-Score für URLs (Copy-Paste-Detektor) ──
app.get('/api/similarity', async (req, res) => {
    const urlsParam = (req.query.urls || '').trim();
    if (!urlsParam) return res.json({});

    const urls = urlsParam.split(',').map(u => decodeURIComponent(u).trim()).filter(Boolean);
    if (urls.length === 0) return res.json({});

    try {
        const allVariants = [];
        for (const url of urls) {
            allVariants.push(url);
            if (url.includes('://www.'))
                allVariants.push(url.replace('://www.', '://'));
            else
                allVariants.push(url.replace('://', '://www.'));
        }
        const deduped = [...new Set(allVariants)];

        // ── Widersprüche direkt laden — unabhängig von article_similarity ──
        // So werden auch Artikel gefunden die noch nicht vom Shingler verarbeitet wurden
        const map = {};
        for (const url of urls) {
            const urlVariants = [url,
                url.includes('://www.') ? url.replace('://www.', '://') : url.replace('://', '://www.')
            ];
            let widersprueche = [];
            try {
                const widRes = await pool.query(`
                    SELECT
                        w.artikel_a_domain, w.artikel_a_titel, w.url_a,
                        w.artikel_b_domain, w.artikel_b_titel, w.url_b,
                        w.konzern, w.konzern_a, w.konzern_b,
                        w.widerspruch_typ, w.erklaerung, w.konfidenz
                    FROM widersprueche w
                    WHERE (w.url_a = ANY($1) OR w.url_b = ANY($1))
                      AND w.konfidenz >= 80
                      AND w.widerspruch_typ IN ('faktisch', 'bewertung')
                    ORDER BY w.konfidenz DESC, w.erzeugt_am DESC
                    LIMIT 10
                `, [urlVariants]);

                // Nur 1 Widerspruch pro Gegenseite (beste Konfidenz) — verhindert Überflutung
                const seenDomains = new Set();
                widersprueche = widRes.rows
                  .filter(w => {
                    const dom = w.url_a === urlVariants[0] ? w.artikel_b_domain : w.artikel_a_domain;
                    if (seenDomains.has(dom)) return false;
                    seenDomains.add(dom);
                    return true;
                  })
                  .slice(0, 3)
                  .map(w => {
                    // Robuster URL-Vergleich — normalisiert www. Varianten
                    const normUrl = normalizeUrlForComparison(url);
                    const normA   = normalizeUrlForComparison(w.url_a);
                    const normB   = normalizeUrlForComparison(w.url_b);
                    const isA = normUrl === normA;
                    const konzernInfo = w.konzern_a && w.konzern_b
                        ? (w.konzern_a === w.konzern_b
                            ? w.konzern_a + ' (intern!)'
                            : (isA ? w.konzern_a : w.konzern_b) + ' vs ' + (isA ? w.konzern_b : w.konzern_a))
                        : (w.konzern || '');
                    return {
                        myUrl:          isA ? w.url_a : w.url_b,
                        otherUrl:       isA ? w.url_b : w.url_a,
                        myTitle:        isA ? w.artikel_a_titel : w.artikel_b_titel,
                        otherTitle:     isA ? w.artikel_b_titel : w.artikel_a_titel,
                        otherDomain:    isA ? w.artikel_b_domain : w.artikel_a_domain,
                        mySentiment:    w.widerspruch_typ === 'bewertung' ? 'POSITIV' : 'NEUTRAL',
                        otherSentiment: w.widerspruch_typ === 'bewertung' ? 'NEGATIV' : 'NEUTRAL',
                        myScore:        w.konfidenz,
                        otherScore:     w.konfidenz,
                        scoreDiff:      w.konfidenz,
                        konzern:        konzernInfo,
                        widerspruchTyp: w.widerspruch_typ,
                        erklaerung:     w.erklaerung,
                        konfidenz:      w.konfidenz,
                    };
                });
            } catch(e) {
                console.error('Widerspruch-Direktsuche Fehler:', e.message);
            }
            // Nur in map eintragen wenn Widersprüche gefunden — sonst kein Badge
            if (widersprueche.length > 0) {
                if (!map[url]) {
                    map[url] = {
                        originality: 100, duplicateCount: 0,
                        isOriginal: true, originalUrl: null,
                        originalTitel: null, originalQuelle: null,
                        similarUrls: [], widersprueche
                    };
                } else {
                    map[url].widersprueche = widersprueche;
                }
            }
        }

        const placeholders = deduped.map((_, i) => `$${i + 1}`).join(', ');

        const result = await pool.query(`
            SELECT
                asi.url,
                asi.originality,
                asi.duplicate_count,
                asi.similar_ids,
                asi.original_id,
                asi.web_id,
                asi.similarity_type,
                CASE WHEN asi.original_id = asi.web_id OR asi.original_id IS NULL THEN true ELSE false END as is_original,
                lhi_orig.url    as original_url,
                lhi_orig.titel  as original_titel,
                lhi_orig.herausgeber as original_quelle,
                asi_orig.similarity_type as original_similarity_type
            FROM article_similarity asi
            LEFT JOIN luma_haupt_index lhi_orig ON lhi_orig.id = asi.original_id
            LEFT JOIN article_similarity asi_orig ON asi_orig.web_id = asi.original_id
            WHERE asi.url = ANY(ARRAY[${placeholders}])
        `, deduped);

        // Ähnliche URLs für jeden Treffer nachladen — alle Artikel der Duplikat-Gruppe
        for (const row of result.rows) {
            let similarUrls = [];
            if (row.similar_ids && row.similar_ids.length > 0) {
                // Alle Artikel holen die dieselbe original_id haben (komplette Gruppe)
                // ── FILTER: Nur 'copy' und 'similar' (nicht 'original') ──
                const simRes = await pool.query(`
                    SELECT DISTINCT asi.url, asi.originality, asi.web_id,
                           lhi.titel, lhi.herausgeber
                    FROM article_similarity asi
                    JOIN luma_haupt_index lhi ON lhi.id = asi.web_id
                    WHERE 
                        (asi.web_id = ANY($1)
                        OR (asi.original_id = $2 AND $2 IS NOT NULL)
                        OR asi.web_id = ANY(
                            SELECT unnest(similar_ids) FROM article_similarity WHERE web_id = ANY($1)
                        ))
                        AND asi.similarity_type IN ('copy', 'similar')
                    ORDER BY asi.originality DESC
                    LIMIT 10
                `, [row.similar_ids, row.original_id]);
                similarUrls = simRes.rows.map(r => ({
                    url:         r.url,
                    titel:       r.titel,
                    quelle:      r.herausgeber,
                    originality: Math.round(r.originality)
                }));
            }

            // ── WIDERSPRÜCHE laden (v4.0) ──
            // Liest aus themen_cluster-basierten Widersprüchen (Original-Artikel)
            // Kein similarity_type Filter mehr — neue Widersprüche kommen von Original-Artikeln
            let widersprueche = [];
            try {
                const widRes = await pool.query(`
                    SELECT
                        w.artikel_a_domain, w.artikel_a_titel, w.url_a,
                        w.artikel_b_domain, w.artikel_b_titel, w.url_b,
                        w.konzern, w.konzern_a, w.konzern_b,
                        w.widerspruch_typ, w.erklaerung, w.konfidenz
                    FROM widersprueche w
                    WHERE (w.url_a = $1 OR w.url_b = $1)
                      AND w.konfidenz >= 80
                      AND w.widerspruch_typ IN ('faktisch', 'bewertung')
                    ORDER BY w.konfidenz DESC, w.erzeugt_am DESC
                    LIMIT 5
                `, [row.url]);

                widersprueche = widRes.rows.map(w => {
                    const isA = w.url_a === row.url;
                    const konzernInfo = w.konzern_a && w.konzern_b
                        ? (w.konzern_a === w.konzern_b
                            ? w.konzern_a + ' (intern!)'
                            : (isA ? w.konzern_a : w.konzern_b) + ' vs ' + (isA ? w.konzern_b : w.konzern_a))
                        : (w.konzern || '');
                    return {
                        myUrl:          isA ? w.url_a : w.url_b,
                        otherUrl:       isA ? w.url_b : w.url_a,
                        myTitle:        isA ? w.artikel_a_titel : w.artikel_b_titel,
                        otherTitle:     isA ? w.artikel_b_titel : w.artikel_a_titel,
                        otherDomain:    isA ? w.artikel_b_domain : w.artikel_a_domain,
                        // Abwärtskompatibel mit Frontend (result-list.js)
                        mySentiment:    w.widerspruch_typ === 'bewertung' ? 'POSITIV' : 'NEUTRAL',
                        otherSentiment: w.widerspruch_typ === 'bewertung' ? 'NEGATIV' : 'NEUTRAL',
                        myScore:        w.konfidenz,
                        otherScore:     w.konfidenz,
                        scoreDiff:      w.konfidenz,
                        konzern:        konzernInfo,
                        // Neue Felder
                        widerspruchTyp: w.widerspruch_typ,
                        erklaerung:     w.erklaerung,
                        konfidenz:      w.konfidenz,
                    };
                });
            } catch (err) {
                console.error('Fehler beim Laden von Widersprüchen:', err.message);
            }

            // ── Original nur anzeigen, wenn DIESER Artikel UND das Original beide >60% ähnlich sind ──
            let showOriginal = row.similarity_type && ['copy', 'similar'].includes(row.similarity_type)
                            && row.original_similarity_type && ['copy', 'similar'].includes(row.original_similarity_type);

            // Widersprüche mergen: direkt gefundene (ohne article_similarity) behalten
            const existingWidersprueche = map[row.url]?.widersprueche || [];
            const mergedWidersprueche = widersprueche.length > 0 ? widersprueche
                : existingWidersprueche;

            map[row.url] = {
                originality:    Math.round(row.originality),
                duplicateCount: row.duplicate_count || 0,
                isOriginal:     row.is_original,
                originalUrl:    (showOriginal ? row.original_url : null) || null,
                originalTitel:  (showOriginal ? row.original_titel : null) || null,
                originalQuelle: (showOriginal ? row.original_quelle : null) || null,
                similarUrls,
                widersprueche:  mergedWidersprueche,
            };
        }
        res.json(map);
    } catch (err) {
        console.error('Fehler bei /api/similarity:', err.message);
        res.status(500).json({});
    }
});


// ── /api/votes — Community Voting mit User-Tracking ─────────────────────────
app.post('/api/votes', async (req, res) => {
    try {
        const { domain, type } = req.body;
        if (!domain || !['positive','neutral','negative'].includes(type)) {
            return res.status(400).json({ success: false, error: 'Ungültige Parameter' });
        }

        // Auth prüfen — Nutzer muss eingeloggt sein
        const userId = req.session?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, error: 'Nicht angemeldet' });
        }

        // Vote verarbeiten mit User-Tracking (kein Doppelvoting)
        const result = await votesManager.processVote(userId, domain, type);
        res.json({ success: true, ...result });

    } catch (err) {
        console.error('Vote Fehler:', err.message);
        res.status(500).json({ success: false, error: 'Serverfehler' });
    }
});

// ── /api/votes — GET: aktueller Vote des Users für eine Domain ───────────────
app.get('/api/votes/my', async (req, res) => {
    try {
        const domain  = (req.query.domain || '').trim();
        const userId  = req.session?.userId;
        if (!domain || !userId) return res.json({ vote: null });
        const vote = await votesManager.getUserVote(userId, domain);
        res.json({ vote });
    } catch (err) {
        res.json({ vote: null });
    }
});

// ── /api/votes — GET: Vote-Zahlen für Domains (Batch) ───────────────────────
app.get('/api/votes', async (req, res) => {
    try {
        const domains = (req.query.domains || '').split(',').map(d => d.trim()).filter(Boolean);
        if (domains.length === 0) return res.json({});
        const map = await votesManager.getVotesBatch(domains);
        const obj = {};
        for (const [k, v] of map) obj[k] = v;
        res.json(obj);
    } catch (err) {
        res.status(500).json({});
    }
});

// ── Haupt-API Routen (modular) ──
// ── /api/related-questions — Ähnliche Fragen aus luma_faq ──────────────────
app.get('/api/related-questions', async (req, res) => {
    const query = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    if (!query) return res.json([]);

    try {
        const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        if (terms.length === 0) return res.json([]);

        const p1 = '%' + terms[0] + '%';
        const p2 = terms.length > 1 ? '%' + terms[1] + '%' : p1;

        // Synonyme laden — neue Array-basierte Struktur
        const synonymRes = await pool.query(
            `SELECT begriffe FROM luma_synonyme WHERE begriffe && $1::text[]`,
            [terms]
        );
        const synonymTerms = synonymRes.rows.flatMap(r => r.begriffe).filter(Boolean);
        const alleTerms = [...new Set([...terms, ...synonymTerms])].slice(0, 10);

        const conditions = alleTerms.map((_, i) =>
            `(f.frage ILIKE $${i + 1} OR f.antwort ILIKE $${i + 1} OR f.thema ILIKE $${i + 1})`
        ).join(' OR ');
        const params = [...alleTerms.map(t => '%' + t + '%')];

        // $1 = '%alleTerms[0]%' — direkte Treffer über Index 1
        const directTermIdx = 1;
        params.push(limit); // Limit als letzter Parameter

        const result = await pool.query(`
            SELECT
                f.frage              AS frage,
                LEFT(f.antwort, 450) AS antwort,
                f.url                AS url,
                f.thema              AS titel,
                f.quelle             AS quelle,
                f.vertrauen          AS score
            FROM luma_faq f
            WHERE (${conditions})
              AND NOT (
                  f.quelle = 'general'
                  AND NOT (f.frage ILIKE $${directTermIdx} OR f.antwort ILIKE $${directTermIdx})
              )
              AND f.frage NOT ILIKE 'Was ist bekannt%'
              AND f.frage NOT ILIKE 'Was sind aktuelle%'
              AND LENGTH(f.frage) BETWEEN 10 AND 200
            ORDER BY
                CASE WHEN f.frage ILIKE $${directTermIdx} THEN 0 ELSE 1 END,
                f.vertrauen DESC NULLS LAST,
                f.erstellt_am DESC
            LIMIT $${params.length}
        `, params);

        const seen = new Set();
        const deduped = result.rows.filter(row => {
            const key = (row.frage || '').toLowerCase().trim().substring(0, 80);
            if (seen.has(key)) return false;
            seen.add(key);
            // Nur echte Fragen
            const frage = (row.frage || '').trim();
            return frage.includes('?') ||
                /^(was|wie|wer|warum|wo|wann|welche|kann|ist|gibt|haben|sollte|darf|muss|kostet|dauert)/i.test(frage);
        });

        res.json(deduped);
    } catch (err) {
        console.error('Fehler bei /api/related-questions:', err.message);
        res.status(500).json([]);
    }
});

// ── /api/search — Search-Endpoint für Widgets (Async Fetch) ────────────────
app.get('/api/search', async (req, res) => {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    
    if (!q) return res.json({ results: [] });

    try {
        const results = await search(q, { limit });
        res.json({ results });
    } catch (err) {
        console.error('API Search Error:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

require('./server/routes/index')(app);

// ============================================================
// ERROR HANDLING & 404
// ============================================================

app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
    console.error("❌ Server Error:", err);
    res.status(500).json({ error: "Internal server error" });
});

// ============================================================
// SERVER START - HTTP + HTTPS
// ============================================================

let httpServer = null;
let httpsServer = null;

function startServer() {
    // ─── ALGORITHMUS-LOGGER INITIALISIEREN ────────────────────────────────────
    const algorithmLogger = require('./algorithmus/algorithmus-logger');
    
    console.log('\n══════════════════════════════════════════════════════════════════════════════════════════');
    console.log('🧬 ALGORITHMUS-MODULE INITIALISIEREN (19 Dateien)');
    console.log('══════════════════════════════════════════════════════════════════════════════════════════\n');
    
    // Versuche alle Module zu laden
    const moduleStatus = {};
    
    const modulesToLoad = [
        './algorithmus/ranking',
        './algorithmus/quality-metrics',
        './algorithmus/simhash',
        './algorithmus/pogo-tracking',
        './algorithmus/spam-filter',
        './algorithmus/trust-score',
        './algorithmus/domain-diversity',
        './algorithmus/reciprocal-trust',
        './algorithmus/user-account-trust',
        './algorithmus/user-journey',
        './algorithmus/trend_engine',
        './algorithmus/ads/ad-density-malus',
        './algorithmus/ads/source-reliability',
        './algorithmus/intelligence/dynamic-weights',
        './algorithmus/intelligence/intent-engine',
        './algorithmus/intelligence/keyword-boost',
        './algorithmus/intelligence/semantic-engine',
    ];
    
    modulesToLoad.forEach((modulePath) => {
        const moduleName = modulePath.split('/').pop();
        try {
            require(modulePath);
            console.log(`   ✅ ${moduleName.padEnd(30)} geladen`);
            moduleStatus[moduleName] = 'OK';
        } catch (e) {
            console.log(`   ⚠️  ${moduleName.padEnd(30)} FEHLER: ${e.message.slice(0, 40)}`);
            moduleStatus[moduleName] = 'ERROR';
        }
    });
    
    console.log('\n══════════════════════════════════════════════════════════════════════════════════════════');
    
    // Zeige Status-Bericht
    const successCount = Object.values(moduleStatus).filter(s => s === 'OK').length;
    console.log(`\n✅ ${successCount}/${modulesToLoad.length} Module erfolgreich geladen\n`);
    algorithmLogger.printModuleStatus();
    
    // Semantic AI initialisieren (async, läuft parallel zum Server)
    (async () => {
        try {
            await semanticAI.initSemanticAI();
        } catch (err) {
            console.error('[SemanticAI] Fehler beim Start:', err.message);
        }
    })();

    // HTTP Server (für Entwicklung)
    httpServer = app.listen(PORT, () => {
        console.log(`
    ██╗     ██╗   ██╗███╗   ███╗ █████╗
    ██║     ██║   ██║████╗ ████║██╔══██╗
    ██║     ██║   ██║██╔████╔██║███████║
    ██║     ██║   ██║██║╚██╔╝██║██╔══██║
    ███████╗╚██████╔╝██║ ╚═╝ ██║██║  ██║
    ╚══════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝

    🚀 Premium v2.0 SECURITY EDITION läuft!

    📡 HTTP:  http://localhost:${PORT}
    🔒 HTTPS: https://localhost:${HTTPS_PORT} (mit HTTPS-Setup)

    ✓ Security Features aktiviert:
      • HTTPS/TLS Verschlüsselung
      • Rate Limiting (1000/15min global, 60/min search)
      • XSS Protection (Input Sanitization)
      • SQL Injection Protection
      • Security Headers (CSP, HSTS, X-Frame)
      • CORS Management
      • API Key Validation

    🏗️  Compression: Enabled
    `);
    
    // 🗑️  Alle Cron-Jobs initialisieren
    initAllCronJobs();
    require('./server/routes/hub').initHubSocket(httpServer, sessionMiddleware);
    });

    // HTTPS Server (Falls Zertifikate vorhanden)
    try {
        const credentials = setupHTTPS();
        if (credentials && credentials.key && credentials.cert) {
            httpsServer = https.createServer(credentials, app);
            httpsServer.listen(HTTPS_PORT, () => {
                console.log(`\n✅ HTTPS Server erfolgreich gestartet auf Port ${HTTPS_PORT}`);
                console.log(`🔐 Zertifikat geladen und aktiv`);
            });
        } else {
            console.log(`\n⚠️  HTTPS nicht verfügbar - Zertifikate nicht gefunden`);
            console.log(`📖 Siehe config/CERTIFICATE-GENERATION.js für Setup-Anleitung`);
        }
    } catch (err) {
        console.log(`\n⚠️  HTTPS-Setup fehlgeschlagen:`);
        console.log(`   ${err.message}`);
        console.log(`📖 Siehe config/CERTIFICATE-GENERATION.js für Setup-Anleitung`);
    }
}

// Tabellen sicherstellen, dann Server starten
Promise.all([votesManager.initVotesTable(), votesManager.initNutzerVotesTable(), paywallManager.initTable()])
    .then(() => startServer())
    .catch(err => {
        console.error('❌ DB Init Fehler:', err.message);
        startServer(); // Server trotzdem starten
    });

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log("\n🛑 Shutdown signal empfangen...");
    console.log("   Beende HTTP Server...");

    if (httpServer) {
        httpServer.close(() => {
            console.log("   ✓ HTTP Server beendet");
        });
    }

    if (httpsServer) {
        console.log("   Beende HTTPS Server...");
        httpsServer.close(() => {
            console.log("   ✓ HTTPS Server beendet");
        });
    }

    setTimeout(() => {
        console.log("✅ Server vollständig beendet");
        process.exit(0);
    }, 2000);
});