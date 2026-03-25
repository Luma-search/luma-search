'use strict';

/**
 * Domain Authority Manager
 * Berechnet eingehende Link-Anzahl pro Domain aus luma_links.
 * Ergebnis wird im Memory gecacht und stündlich erneuert.
 */

const { pool } = require('../crawler_new/db.js');

let authorityCache = new Map();
let lastCacheTime  = 0;
const CACHE_TTL    = 60 * 60 * 1000; // 1 Stunde
let loadPromise    = null;

async function loadAuthorityCache() {
    if (loadPromise) return loadPromise; // Verhindert parallele DB-Abfragen

    loadPromise = (async () => {
        try {
            const res = await pool.query(`
                SELECT
                    lower(regexp_replace(nach_url, '^https?://(?:www\\.)?([^/?#]+).*$', '\\1')) AS domain,
                    COUNT(*)::integer AS inbound_count
                FROM luma_links
                GROUP BY 1
                HAVING COUNT(*) >= 1
            `);

            const newCache = new Map();
            for (const row of res.rows) {
                if (row.domain && !row.domain.includes('/')) {
                    newCache.set(row.domain, row.inbound_count);
                }
            }
            authorityCache = newCache;
            lastCacheTime  = Date.now();
            console.log(`[DOMAIN-AUTH] Cache geladen: ${authorityCache.size} Domains aus luma_links`);
        } catch (err) {
            console.warn('[DOMAIN-AUTH] Cache-Laden fehlgeschlagen:', err.message);
        } finally {
            loadPromise = null;
        }
    })();

    return loadPromise;
}

/**
 * Gibt den eingehenden Link-Count für eine Domain zurück (aus Cache).
 * Triggert automatisch einen Cache-Reload wenn veraltet.
 * @param {string} hostname  - z.B. "chefkoch.de" (ohne www.)
 * @returns {number}         - Eingehende Link-Anzahl (0 wenn unbekannt)
 */
function getInboundCount(hostname) {
    const domain = hostname.replace(/^www\./, '').toLowerCase();
    const now = Date.now();

    // Cache starten wenn leer oder veraltet (async im Hintergrund)
    if (authorityCache.size === 0 || (now - lastCacheTime) > CACHE_TTL) {
        loadAuthorityCache();
    }

    return authorityCache.get(domain) || 0;
}

/**
 * Wandelt eingehende Link-Anzahl in einen Bonus-Score um (0–10 Punkte).
 * Logarithmische Skala: sanfter Anstieg, kein exponentieller Vorteil für Mega-Sites.
 *   1 Link → +1 Pkt | 10 Links → +4 Pkt | 100 Links → +9 Pkt | 200+ → +10 Pkt (max)
 * @param {string} hostname
 * @returns {number} 0–10
 */
function getDomainAuthorityBonus(hostname) {
    const count = getInboundCount(hostname);
    if (count === 0) return 0;
    return Math.min(10, Math.round(Math.log10(count + 1) * 4.3));
}

// Cache beim ersten Modul-Import starten (Hintergrund)
loadAuthorityCache();

module.exports = { getDomainAuthorityBonus, getInboundCount, loadAuthorityCache };
