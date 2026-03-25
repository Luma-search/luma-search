const { pool } = require('../crawler_new/db');
const crypto = require('crypto');

const initTable = async () => {
    try {
        // Erst: Tabelle erstellen wenn nicht vorhanden
        await pool.query(`
            CREATE TABLE IF NOT EXISTS public.luma_paywall_reports
            (
                id SERIAL PRIMARY KEY,
                url_hash text NOT NULL,
                full_url text NOT NULL,
                domain text DEFAULT '',
                reporter_id integer,
                created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT luma_paywall_reports_url_hash_reporter_id_key UNIQUE (url_hash, reporter_id)
            );
        `);

        // Dann: Domain-Spalte hinzufügen falls sie fehlt (Migration)
        await pool.query(`
            ALTER TABLE IF EXISTS public.luma_paywall_reports
            ADD COLUMN IF NOT EXISTS domain text DEFAULT '';
        `);

        // Index erstellen falls nicht vorhanden
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_luma_paywall_domain ON public.luma_paywall_reports(domain);
        `);

        await pool.query(`
            ALTER TABLE IF EXISTS public.luma_paywall_reports OWNER to postgres;
        `);

        console.log('✓ Tabelle "luma_paywall_reports" initialisiert.');
    } catch (err) {
        console.error('✗ Fehler beim Initialisieren der Tabelle "luma_paywall_reports":', err.message);
        // Nicht werfen - Server soll trotzdem starten
    }
};

const reportUrl = async (url, reporterId) => {
    if (!url) {
        throw new Error('URL ist erforderlich.');
    }

    let fullUrl;
    let domain = '';
    try {
        // Stellt sicher, dass die URL valide ist und normalisiert sie
        fullUrl = new URL(url).toString();
        domain = new URL(fullUrl).hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
        throw new Error('Ungültige URL.');
    }
    
    const urlHash = crypto.createHash('md5').update(fullUrl).digest('hex');

    await pool.query(
        `INSERT INTO public.luma_paywall_reports (full_url, url_hash, domain, reporter_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (url_hash, reporter_id) DO NOTHING`,
        [fullUrl, urlHash, domain, reporterId]
    );
    return { success: true, message: 'Paywall gemeldet.' };
};

const addReport = async (url, reporterId) => {
    return await reportUrl(url, reporterId);
};

// Zähle Paywall-Meldungen pro Domain
const getPaywallCounts = async (urls) => {
    if (!urls || urls.length === 0) return {};
    
    try {
        // Extrahiere Domains aus URLs
        const domains = urls.map(url => {
            try {
                const parsed = new URL(url);
                return parsed.hostname.replace(/^www\./, '').toLowerCase();
            } catch {
                return null;
            }
        }).filter(d => d);

        // Zähle Meldungen pro Domain
        const result = {};
        
        for (const domain of domains) {
            const res = await pool.query(
                `SELECT COUNT(*) as count FROM public.luma_paywall_reports
                 WHERE full_url LIKE $1`,
                [`%${domain}%`]
            );
            result[domain] = parseInt(res.rows[0]?.count || 0);
        }
        
        return result;
    } catch (e) {
        console.error('Paywall Counts Error:', e);
        return {};
    }
};

// Prüfe ob eine Domain eine Paywall hat
const hasPaywall = async (domain) => {
    try {
        const normalized = domain.replace(/^www\./, '').toLowerCase();
        const res = await pool.query(
            `SELECT COUNT(*) as count FROM public.luma_paywall_reports
             WHERE full_url LIKE $1
             LIMIT 1`,
            [`%${normalized}%`]
        );
        return parseInt(res.rows[0]?.count || 0) > 0;
    } catch (e) {
        return false;
    }
};

// Lädt Paywall-Status für mehrere Domains (Batch-Operation wie votesManager.getVotesBatch)
const getPaywallBatch = async (domains) => {
    if (!domains || domains.length === 0) return new Map();

    try {
        const normalized = [...new Set(domains.map(d => d.replace(/^www\./, '').toLowerCase()))];
        
        // Direkte Abfrage nach Domains (viel schneller!)
        const res = await pool.query(
            `SELECT DISTINCT domain FROM public.luma_paywall_reports
             WHERE domain = ANY($1::text[]) AND domain IS NOT NULL AND domain != ''`,
            [normalized]
        );

        // Erstelle Map von Domain → hasPaywall (1 = ja, 0 = nein)
        const map = new Map();
        const paywallDomains = new Set(res.rows.map(r => r.domain));

        // Setze Map für jede übergebene Domain
        normalized.forEach(domain => {
            map.set(domain, paywallDomains.has(domain) ? 1 : 0);
        });

        return map;
    } catch (e) {
        console.error('Paywall Batch Error:', e);
        return new Map();
    }
};

module.exports = {
    initTable,
    reportUrl,
    addReport,
    getPaywallCounts,
    hasPaywall,
    getPaywallBatch,
};