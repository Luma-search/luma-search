// chrono.js — Autocomplete-Route für Unix-Timestamp Konverter
'use strict';

const { chronoScan } = require('../../../modules/unix-timestamp/chrono_scan');

module.exports = function registerChronoRoute(app) {
    app.get('/chrono_autocomplete', (req, res) => {
        const q = (req.query.q || '').trim();
        const result = chronoScan(q);
        res.json(result ? [result] : []);
    });
};
