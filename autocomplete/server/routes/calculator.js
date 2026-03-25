/**
 * Luma Autocomplete – Route: GET /calculator_autocomplete
 */

'use strict';

module.exports = function registerCalculatorRoute(app, { calculator }) {
    app.get('/calculator_autocomplete', (req, res) => {
        const query = (req.query.q || '').trim();
        try {
            const calcResult = calculator.calculate(query);
            const isValidNumber = !isNaN(parseFloat(calcResult)) && isFinite(calcResult);
            res.json(isValidNumber ? [`${query} = ${calcResult}`] : []);
        } catch (error) {
            res.json([]);
        }
    });
};
