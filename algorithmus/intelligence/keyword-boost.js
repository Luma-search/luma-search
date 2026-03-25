'use strict';

/**
 * Keyword-Boost: Fragt luma_keywords DB ab und ermittelt Intent-Override + Kategorie.
 * Verwendet beim Suchvorgang um den Intent präziser zu bestimmen.
 */

const { pool } = require('../../crawler_new/db.js');

const KATEGORIE_TO_INTENT = {
    nachrichten: 'NEWS',
    news:        'NEWS',
    politik:     'NEWS',
    gesundheit:  'YMYL',
    medizin:     'YMYL',
    finanzen:    'YMYL',
    recht:       'YMYL',
    produkt:     'COMMERCIAL',
    einkauf:     'COMMERCIAL',
    shop:        'COMMERCIAL',
    shopping:    'COMMERCIAL',
    unterhaltung: 'ENTERTAINMENT',
    sport:       'ENTERTAINMENT',
    musik:       'ENTERTAINMENT',
    film:        'ENTERTAINMENT',
    spiel:       'ENTERTAINMENT',
};

function mapKategorieToIntent(kategorie) {
    if (!kategorie) return null;
    const k = kategorie.toLowerCase();
    for (const [key, intent] of Object.entries(KATEGORIE_TO_INTENT)) {
        if (k.includes(key)) return intent;
    }
    return null;
}

/**
 * Holt keyword-Kontext für eine Query aus der luma_keywords Datenbank.
 * @param {string} query
 * @returns {Promise<{ keywordFound: boolean, kategorie: string|null, intentOverride: string|null }>}
 */
async function getKeywordContext(query) {
    const words = query.toLowerCase().trim().split(/\s+/).slice(0, 4);
    if (!words.length) return { keywordFound: false, kategorie: null, intentOverride: null };

    try {
        const SQL = `
            SELECT k.keyword, kat.name AS kategorie, k.score
            FROM luma_keywords k
            LEFT JOIN luma_kategorien kat ON kat.id = k.kategorie_id
            WHERE k.keyword = ANY($1::text[]) OR k.keyword ILIKE $2
            ORDER BY k.score DESC
            LIMIT 5
        `;
        const result = await pool.query(SQL, [words, `${words[0]}%`]);
        if (!result.rows || !result.rows.length) {
            return { keywordFound: false, kategorie: null, intentOverride: null };
        }

        const top = result.rows[0];
        const intentOverride = mapKategorieToIntent(top.kategorie);
        return { keywordFound: true, kategorie: top.kategorie, intentOverride };
    } catch {
        return { keywordFound: false, kategorie: null, intentOverride: null };
    }
}

module.exports = { getKeywordContext };
