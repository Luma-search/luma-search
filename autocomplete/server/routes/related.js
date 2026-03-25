/**
 * Luma Autocomplete – Route: GET /related_autocomplete
 * Verwandte Suchbegriffe via Thesaurus.
 */

'use strict';

const thesaurus = require('../data/thesaurus');

module.exports = function registerRelatedRoute(app) {
    app.get('/related_autocomplete', (req, res) => {
        const query = (req.query.q || '').toLowerCase().trim();
        if (query.length < 2) return res.json([]);

        // Exakter Match
        if (thesaurus[query]) {
            return res.json(thesaurus[query]);
        }

        // Partieller Match
        const partialMatches = Object.entries(thesaurus)
            .filter(([key]) => key.includes(query) || query.includes(key))
            .flatMap(([, vals]) => vals);

        const unique = [...new Set(partialMatches)].slice(0, 6);
        res.json(unique);
    });
};
