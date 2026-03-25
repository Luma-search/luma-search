'use strict';

/**
 * Intent-Engine: Kombiniert Regex-Intent mit luma_keywords DB-Intent.
 * DB-basierter Intent hat höhere Priorität als generische Regex-Erkennung.
 */

/**
 * Bestimmt den finalen Search-Intent.
 * Priorität: kwOverride (DB) > regexIntent (wenn nicht INFORMATIONAL) > INFORMATIONAL
 *
 * @param {string}      regexIntent - Intent aus detectSearchIntent() in ranking.js
 * @param {string|null} kwOverride  - Intent aus luma_keywords Kategorie
 * @returns {string} finaler Intent
 */
function resolveIntent(regexIntent, kwOverride) {
    if (kwOverride) return kwOverride;
    if (regexIntent && regexIntent !== 'INFORMATIONAL') return regexIntent;
    return regexIntent || 'INFORMATIONAL';
}

module.exports = { resolveIntent };
