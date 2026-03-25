/**
 * Luma Autocomplete – Route: GET /currency_autocomplete
 */

'use strict';

module.exports = function registerCurrencyRoute(app, { convertCurrency }) {
    app.get('/currency_autocomplete', (req, res) => {
        const query = (req.query.q || '').trim();
        try {
            const result = convertCurrency(query);
            res.json(result ? [result] : []);
        } catch (error) {
            res.json([]);
        }
    });
};
