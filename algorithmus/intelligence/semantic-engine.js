'use strict';

/**
 * Semantic Engine: Berechnet semantischen Bonus aus Synonymen + Entitäten.
 * Nutzt das bestehende modules/synonyms/synonyms.js (getsynonymBonus).
 */

const { getsynonymBonus } = require('../../modules/synonyms/synonyms.js');

/**
 * Berechnet semantischen Bonus für ein einzelnes Suchergebnis.
 *
 * Quellen:
 *  1. Synonym-Matching (max +20) via bestehendem getsynonymBonus()
 *  2. Entitäten-Matching (max +10) via item.entities / item.entitaeten
 *
 * @param {object} item  - Suchergebnis (title, description, content, entities)
 * @param {string} query - Suchanfrage
 * @returns {number}     - Bonus 0–30
 */
function getSemanticBonus(item, query) {
    let bonus = 0;

    // 1. Synonym-Bonus (max +20)
    const fullText = [
        item.title       || '',
        item.description || '',
        item.content     || '',
    ].join(' ');
    bonus += getsynonymBonus(fullText, query);

    // 2. Entitäten-Matching (max +10)
    const entities = item.entities || item.entitaeten || [];
    if (Array.isArray(entities) && entities.length > 0) {
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        for (const entity of entities) {
            const eStr = (typeof entity === 'string'
                ? entity
                : (entity.name || entity.wert || '')
            ).toLowerCase();
            if (eStr && queryWords.some(w => eStr.includes(w) || w.includes(eStr))) {
                bonus += 5;
                if (bonus >= 30) break;
            }
        }
    }

    return Math.min(bonus, 30);
}

module.exports = { getSemanticBonus };
