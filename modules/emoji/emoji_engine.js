// emoji_engine.js — Zwei Modi: :name → Matches, :: → alle Emojis (Picker)
'use strict';

const EMOJI_DATA = require('./emoji_list.js');

/**
 * Findet Emojis basierend auf Keyword-Suche.
 *
 * Modus 1: ":herz" → bis zu 8 passende Emojis zurückgeben
 * Modus 2: "::"    → showPicker: true + alle Emojis für das Picker-Panel
 *
 * @param {string} input
 * @returns {{ results, showPicker, type: 'emoji' }|null}
 */
function findEmoji(input) {
    if (!input) return null;

    const raw = input.trim();

    // Modus 2: Genau "::" → Emoji-Picker öffnen
    if (raw === '::') {
        return {
            results:    EMOJI_DATA.map(e => ({ emoji: e.emoji, keyword: e.keywords[0] })),
            showPicker: true,
            type:       'emoji'
        };
    }

    // Modus 1: Beginnt mit ":" aber ist nicht "::" → Keyword-Suche
    if (raw.startsWith(':') && raw.length > 1) {
        const keyword = raw.slice(1).toLowerCase().trim();
        if (!keyword) return null;

        const matches = EMOJI_DATA
            .filter(e => e.keywords.some(k => k.includes(keyword)))
            .slice(0, 8)
            .map(e => ({ emoji: e.emoji, keyword: e.keywords[0] }));

        if (!matches.length) return null;

        return {
            results:    matches,
            showPicker: false,
            type:       'emoji'
        };
    }

    return null;
}

module.exports = { findEmoji };