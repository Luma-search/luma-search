/**
 * Luma Autocomplete – Route: GET /autocomplete
 * Haupt-Suchvorschläge mit Fuzzy-Scoring gegen die Datenbank.
 */

'use strict';

const { createCache }      = require('../cache');
const { calculateScore }   = require('../scoring');
const { detectSearchType } = require('../detectSearchType');

const cache = createCache(500);

module.exports = function registerAutocompleteRoute(app, { loadDatabase }) {
    app.get('/autocomplete', async (req, res) => {
        const query = (req.query.q || '').toLowerCase().trim();
        if (query.length < 1) return res.json([]);

        if (cache.has(query)) return res.json(cache.get(query));

        try {
            const db = await loadDatabase();
            const suggestions = new Map();

            db.forEach(item => {
                const title   = item.title   || '';
                const content = item.content || '';
                const url     = item.url     || '';

                const titleScore = calculateScore(query, title);

                let contentScore = 0;
                if (titleScore < 50) {
                    const hits = (content.toLowerCase().match(
                        new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                    ) || []).length;
                    contentScore = Math.min(30, hits * 5);
                }

                const urlScore   = url.toLowerCase().includes(query) ? 20 : 0;
                const finalScore = Math.max(titleScore, contentScore) + urlScore;

                if (finalScore > 0 && title) {
                    suggestions.set(title, {
                        score:      finalScore,
                        item,
                        searchType: detectSearchType(title)
                    });
                }
            });

            const result = Array.from(suggestions.entries())
                .sort((a, b) => b[1].score !== a[1].score
                    ? b[1].score - a[1].score
                    : a[0].length - b[0].length)
                .slice(0, 8)
                .map(([title, data]) => ({
                    title,
                    type:  data.searchType,
                    score: data.score,
                    url:   data.item.url
                }));

            cache.set(query, result);
            res.json(result);

        } catch (err) {
            console.error('Autocomplete Fehler:', err.message);
            res.json([]);
        }
    });
};
