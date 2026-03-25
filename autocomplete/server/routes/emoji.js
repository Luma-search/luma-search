// emoji.js — Autocomplete-Route für Emoji-Suche und Picker
'use strict';

const { findEmoji } = require('../../../modules/emoji/emoji_engine');

module.exports = function registerEmojiRoute(app) {
    app.get('/emoji_autocomplete', (req, res) => {
        const q = (req.query.q || '').trim();
        const result = findEmoji(q);
        res.json(result || { results: [], showPicker: false, type: 'emoji' });
    });
};
