// acronym_engine.js — Case-insensitive Abkürzungssuche
'use strict';

const ACRONYMS = require('./acronyms_list.js');

/**
 * Sucht eine Abkürzung in der Datenbank (case-insensitive).
 * @param {string} input
 * @returns {{ short, long, category, description, type: 'acronym' }|null}
 */
function findAcronym(input) {
  if (!input) return null;

  const query = input.trim().toUpperCase();
  const entry = ACRONYMS[query];

  if (!entry) return null;

  return {
    short:       query,
    long:        entry.long,
    category:    entry.category,
    description: entry.description,
    type:        'acronym'
  };
}

module.exports = { findAcronym };