// watt.js — Autocomplete-Route für Stromkosten-Rechner
'use strict';

const { wattWaechter } = require('../../../modules/watt_waechter/watt-waechter');

module.exports = function registerWattRoute(app) {
    app.get('/watt_autocomplete', (req, res) => {
        const q = (req.query.q || '').trim();
        const result = wattWaechter(q);
        res.json(result ? [result] : []);
    });
};
