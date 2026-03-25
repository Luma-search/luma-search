// support_engine.js — Sucht Support-Nummern mit Alias-Matching
'use strict';

const SUPPORT_LIST = require('./support_list.js');

const SIGNAL_WORDS = [
  'support', 'hotline', 'hilfe', 'telefon', 'telefonnummer', 'kontakt',
  'anrufen', 'kundenservice', 'kundendienst', 'nummer', 'helpdesk',
  'servicehotline', 'erreichbar', 'call center', 'callcenter'
];

/**
 * Sucht einen Support-Eintrag anhand der Nutzeranfrage.
 * Prüft alle Firmennamen UND Aliases.
 * @param {string} input
 * @returns {{ name, phone, hours, website, info, type: 'support' }|null}
 */
function findSupportNumber(input) {
  if (!input) return null;

  const query = input.toLowerCase().trim();
  const hasSignal = SIGNAL_WORDS.some(w => query.includes(w));

  // Ohne Signal-Wort: nur exakter Match erlaubt
  // Verhindert False-Positives wie "wikinger" → ING, "donnerwolf" → irgendwas
  if (!hasSignal) {
    for (const entry of Object.values(SUPPORT_LIST)) {
      const exactMatch = entry.aliases.some(alias => {
        // Alias muss mindestens 4 Zeichen haben UND als ganzes Wort vorkommen
        if (alias.length < 4) return false;
        const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return regex.test(query);
      });
      if (exactMatch) {
        return {
          name:    entry.name,
          phone:   entry.phone,
          hours:   entry.hours,
          website: entry.website,
          info:    entry.info,
          type:    'support'
        };
      }
    }
    return null;
  }

  // Mit Signal-Wort: Alias als ganzes Wort suchen (kein Substring-Match)
  for (const entry of Object.values(SUPPORT_LIST)) {
    const matched = entry.aliases.some(alias => {
      const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(query);
    });
    if (matched) {
      return {
        name:    entry.name,
        phone:   entry.phone,
        hours:   entry.hours,
        website: entry.website,
        info:    entry.info,
        type:    'support'
      };
    }
  }

  return null;
}

module.exports = { findSupportNumber };