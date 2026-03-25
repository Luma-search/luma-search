// domainGuard.js — Autocomplete-Route für Domain-Alters-Check
'use strict';

const { checkDomainSecurity } = require('../../../modules/security-check/domain_guard');

// Nur auslösen wenn Query wie eine Domain aussieht (Punkt vorhanden, keine Leerzeichen)
const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

module.exports = function registerDomainGuardRoute(app) {
    app.get('/domain_guard_autocomplete', async (req, res) => {
        const q = (req.query.q || '').trim();
        if (!DOMAIN_PATTERN.test(q) || q.includes(' ')) return res.json([]);

        try {
            const result = await checkDomainSecurity(q);
            res.json(result ? [result] : []);
        } catch {
            res.json([]);
        }
    });
};
