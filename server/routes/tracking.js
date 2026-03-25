'use strict';

/**
 * Tracking-Routen: Klick-Qualität & Pogo-Sticking
 *
 * POST /api/klick      — Klick auf Suchergebnis erfassen
 * POST /api/verweilzeit — Verweilzeit per Beacon (vom Frontend)
 */
const router      = require('express').Router();
const { pool: sessionPool } = require('../../crawler_new/db.js');
const pogoTracking = require('../../algorithmus/pogo-tracking');

/**
 * POST /api/klick
 * Body: { url, domain, position, suchanfrage }
 * Frontend ruft dies beim Klick auf ein Ergebnis auf.
 * Gibt klickId zurück → im localStorage speichern für Beacon.
 */
router.post('/api/klick', async (req, res) => {
    const { url, domain, position, suchanfrage } = req.body;

    if (!url) return res.status(400).json({ error: 'url fehlt' });

    const sessionId = req.session?.id || 'anonym';
    const nutzerId  = req.session?.userId || null;

    const klickId = await pogoTracking.klickErfassen(sessionPool, {
        url,
        domain:      domain      || '',
        sessionId,
        nutzerId,
        position:    position    || 0,
        suchanfrage: suchanfrage || '',
    });

    return res.json({ success: true, klickId });
});

/**
 * POST /api/verweilzeit
 * Body: { klickId, verweilzeit_ms }
 * Wird per navigator.sendBeacon() vom Frontend geschickt,
 * wenn der Nutzer die Seite verlässt.
 */
router.post('/api/verweilzeit', async (req, res) => {
    const { klickId, verweilzeit_ms } = req.body;

    if (!klickId) return res.sendStatus(400);

    await pogoTracking.rueckkehrErfassen(sessionPool, {
        klickId:       parseInt(klickId),
        verweilzeit_ms: parseInt(verweilzeit_ms) || null,
    });

    return res.sendStatus(200);
});

module.exports = router;
