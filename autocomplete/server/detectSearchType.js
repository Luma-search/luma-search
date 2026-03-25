/**
 * Luma Autocomplete – Intent-Erkennung (Server)
 * Erkennt den Typ einer Suchanfrage.
 */

'use strict';

/**
 * Erkennt den Intent der Suchanfrage.
 * @param {string} query
 * @returns {'question' | 'shopping' | 'news' | 'general'}
 */
function detectSearchType(query) {
    const q = query.toLowerCase();
    if (/^(was|wie|wer|warum|wo|wann)\s|definition|erklär|anleitung|tutorial/.test(q)) return 'question';
    if (/kaufen|buy|preis|kosten|bestellen|shop|angebot/.test(q))                       return 'shopping';
    if (/nachrichten|news|breaking|aktuell|heute/.test(q))                              return 'news';
    return 'general';
}

module.exports = { detectSearchType };
