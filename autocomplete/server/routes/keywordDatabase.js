/**
 * Luma Autocomplete – Route: GET /keywords-db
 * 
 * HYBRID-MODELL PRIO 1: Keyword-Datenbanksuche
 * Sucht in der luma_keywords Tabelle (aus dem Hybrid-Keyword-System)
 * 
 * Diese Ergebnisse haben höchste Priorität und werden VOR der Volltextsuche angezeigt.
 * Keywords sind "Volltreffer" - der Nutzer sucht gezielt nach Konzepten, die wir bereits extrahiert haben.
 */

'use strict';

const { createCache } = require('../cache');
const { pool: dbPool } = require('../../../crawler_new/db.js');

const cache = createCache(500);

module.exports = function registerKeywordDatabaseRoute(app, deps) {
    const pool = (deps && deps.pool) || dbPool;
    app.get('/keywords-db', async (req, res) => {
        const query = (req.query.q || '').toLowerCase().trim();
        if (query.length < 1) return res.json([]);

        // Cache-Check
        const cacheKey = `keywords:${query}`;
        if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

        try {
            // ─── PRIO 1: Exakte / Fuzzy Keyword-Suche in luma_keywords ───────────────────
            const SQL = `
                SELECT
                    k.keyword,
                    kat.name  AS kategorie,
                    k.score
                FROM luma_keywords k
                LEFT JOIN luma_kategorien kat ON kat.id = k.kategorie_id
                WHERE k.keyword ILIKE $1 OR k.keyword ILIKE $2
                ORDER BY
                    k.score DESC,
                    k.keyword ASC
                LIMIT 10
            `;

            const wildcard  = `%${query}%`;
            const startsWith = `${query}%`;

            const result = await pool.query(SQL, [wildcard, startsWith]);
            const rows = result.rows || [];

            // ─── Result-Format für Autocomplete ──────────────────────────
            const keywords = rows.map((row, idx) => ({
                title:    row.keyword,
                type:     'keyword',
                category: row.kategorie || null,
                score:    row.score || 0,
                frequency: row.score,
                priority:  1000 - idx,
                source:   'keyword-database'
            }));

            cache.set(cacheKey, keywords);
            res.json(keywords);

        } catch (err) {
            console.error('Keyword Database Route Fehler:', err.message);
            res.status(500).json([]);
        }
    });
};
