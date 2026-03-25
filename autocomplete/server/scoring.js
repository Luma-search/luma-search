/**
 * Luma Autocomplete – Text-Scoring
 * Fuzzy-Matching und Score-Berechnung für Suchvorschläge.
 */

'use strict';

/**
 * Fuzzy-Match: Prüft ob alle Buchstaben von query in text vorkommen (in Reihenfolge).
 * @param {string} query
 * @param {string} text
 * @returns {boolean}
 */
function fuzzyMatch(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) qi++;
    }
    return qi === q.length;
}

/**
 * Berechnet Match-Score (0-100). Höher = besseres Match.
 * @param {string} query
 * @param {string} text
 * @returns {number}
 */
function calculateScore(query, text) {
    const q = query.toLowerCase();
    const t = text.toLowerCase();
    if (t === q)                                         return 100;
    if (t.startsWith(q))                                return 90;
    if (t.split(/\s+/).some(w => w.startsWith(q)))     return 80;
    if (t.includes(q))                                  return 60;
    if (fuzzyMatch(q, t))                               return 30;
    return 0;
}

module.exports = { fuzzyMatch, calculateScore };
