/**
 * Luma Autocomplete – Route: GET /product_autocomplete
 * Sucht in luma_produkt_details (PostgreSQL) mit dem gleichen Scoring-Algorithmus
 * wie der Haupt-Autocomplete. Nur aktiv wenn die Query produktrelevant ist.
 */

'use strict';

const { createCache } = require('../cache');

const cache = createCache(300);

module.exports = function registerProductRoute(app, { pool, searchDbForAutocomplete }) {

    // ── /ai_autocomplete bleibt unverändert (In-Memory-Suche) ──────────────────
    app.get('/ai_autocomplete', (req, res) => {
        const query = (req.query.q || '').trim();
        if (query.length < 2) return res.json([]);
        res.json(searchDbForAutocomplete(query, 5));
    });

    // ── /product_autocomplete → luma_produkt_details (PostgreSQL) ──────────────
    app.get('/product_autocomplete', async (req, res) => {
        const query = (req.query.q || '').trim();
        if (query.length < 2) return res.json([]);

        const cacheKey = query.toLowerCase();
        if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

        // Kein pool → Fallback auf In-Memory-Suche
        if (!pool) return res.json(searchDbForAutocomplete(query, 5));

        try {
            const q    = query.toLowerCase();
            const like = `%${q}%`;
            const sw   = `${q}%`;

            // Scoring via CASE direkt in SQL – identisch zum JS calculateScore()
            const { rows } = await pool.query(`
                SELECT
                    pd.produktname                                                              AS title,
                    pd.preis                                                                    AS price,
                    pd.waehrung                                                                 AS currency,
                    REPLACE(COALESCE(pd.bild_url, hi.vorschaubild), 'http://', 'https://')     AS image,
                    COALESCE(pd.produkt_url, pd.quelle_url, hi.url)                            AS url,
                    pd.marke                                               AS brand,
                    pd.verfuegbarkeit                                      AS availability,
                    LEFT(pd.beschreibung, 200)                             AS description,
                    pd.bewertung                                           AS rating,
                    pd.bewertungsanzahl                                    AS rating_count,
                    CASE
                        WHEN LOWER(pd.produktname) = $1          THEN 100
                        WHEN LOWER(pd.produktname) LIKE $3       THEN 90
                        WHEN LOWER(pd.produktname) LIKE $2       THEN 60
                        WHEN LOWER(pd.marke)       LIKE $2       THEN 40
                        WHEN LOWER(pd.kategorie)   LIKE $2       THEN 30
                        ELSE 20
                    END AS score
                FROM luma_produkt_details pd
                LEFT JOIN luma_haupt_index hi ON hi.id = pd.haupt_id
                WHERE
                    LOWER(pd.produktname) LIKE $2
                    OR LOWER(pd.marke)    LIKE $2
                    OR LOWER(pd.kategorie) LIKE $2
                ORDER BY score DESC, pd.bewertungsanzahl DESC NULLS LAST
                LIMIT 5
            `, [q, like, sw]);

            const result = rows.map(r => ({
                title:        r.title        || '',
                price:        r.price        ? String(r.price) : null,
                currency:     r.currency     || 'EUR',
                image:        r.image        || null,
                url:          r.url          || null,
                brand:        r.brand        || null,
                availability: r.availability || null,
                description:  r.description  || null,
                rating:       r.rating       ? Number(r.rating) : null,
                ratingCount:  r.rating_count ? Number(r.rating_count) : null,
                score:        r.score,
            }));

            cache.set(cacheKey, result);
            res.json(result);

        } catch (err) {
            console.error('product_autocomplete Fehler:', err.message);
            // Fallback auf In-Memory wenn DB-Fehler
            res.json(searchDbForAutocomplete(query, 5));
        }
    });
};
