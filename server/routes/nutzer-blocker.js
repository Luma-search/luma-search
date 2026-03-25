'use strict';

/**
 * NUTZER-BLOCKER ROUTE
 * Datei: C:\Users\Felix\Desktop\Luma\Luma\server\routes\nutzer-blocker.js
 *
 * Einbindung in server/routes/index.js:
 *   const nutzerBlocker = require('./nutzer-blocker');
 *   app.use(nutzerBlocker);
 *
 * Endpunkte:
 *   POST /api/nutzer/blockieren     — Nutzer blockieren
 *   POST /api/nutzer/entblockieren  — Nutzer entblockieren
 *   GET  /api/nutzer/blockiert      — Alle blockierten Nutzer abrufen
 */

const router     = require('express').Router();
const { pool }   = require('../../crawler_new/db.js');
const requireAuth = require('../middleware/requireAuth');

// ─── POST /api/nutzer/blockieren ──────────────────────────────────────────

router.post('/api/nutzer/blockieren', requireAuth, async (req, res) => {
    const sperrerId     = String(req.session.userId);
    const gesperrterName = (req.body.gesperrter_name || '').trim();

    if (!gesperrterName) {
        return res.status(400).json({ error: 'Benutzername fehlt.' });
    }

    try {
        // gesperrter_id anhand des Benutzernamens ermitteln
        const nutzerResult = await pool.query(
            `SELECT id FROM nutzer WHERE benutzername = $1 LIMIT 1`,
            [gesperrterName]
        );

        if (nutzerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Nutzer nicht gefunden.' });
        }

        const gesperrterIdNum = nutzerResult.rows[0].id;

        // Selbst-Sperrung verhindern (Constraint greift auch in DB, aber früher abfangen)
        if (String(gesperrterIdNum) === sperrerId) {
            return res.status(400).json({ error: 'Du kannst dich nicht selbst blockieren.' });
        }

        await pool.query(
            `INSERT INTO gemeinschafts_nutzer_blocker (sperrer_id, gesperrter_id, grund)
             VALUES ($1, $2, 'hub-chat')
             ON CONFLICT (sperrer_id, gesperrter_id) DO NOTHING`,
            [sperrerId, String(gesperrterIdNum)]
        );

        console.log(`🚫 [BLOCKER] User#${sperrerId} hat @${gesperrterName} blockiert`);
        res.json({ success: true });

    } catch (err) {
        console.error('❌ [BLOCKER] blockieren Fehler:', err.message);
        res.status(500).json({ error: 'Blockierung fehlgeschlagen.' });
    }
});

// ─── POST /api/nutzer/entblockieren ──────────────────────────────────────

router.post('/api/nutzer/entblockieren', requireAuth, async (req, res) => {
    const sperrerId      = String(req.session.userId);
    const gesperrterName = (req.body.gesperrter_name || '').trim();

    if (!gesperrterName) {
        return res.status(400).json({ error: 'Benutzername fehlt.' });
    }

    try {
        const nutzerResult = await pool.query(
            `SELECT id FROM nutzer WHERE benutzername = $1 LIMIT 1`,
            [gesperrterName]
        );

        if (nutzerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Nutzer nicht gefunden.' });
        }

        const gesperrterIdNum = nutzerResult.rows[0].id;

        await pool.query(
            `DELETE FROM gemeinschafts_nutzer_blocker
             WHERE sperrer_id = $1 AND gesperrter_id = $2`,
            [sperrerId, String(gesperrterIdNum)]
        );

        console.log(`✅ [BLOCKER] User#${sperrerId} hat @${gesperrterName} entblockiert`);
        res.json({ success: true });

    } catch (err) {
        console.error('❌ [BLOCKER] entblockieren Fehler:', err.message);
        res.status(500).json({ error: 'Entblockierung fehlgeschlagen.' });
    }
});

// ─── GET /api/nutzer/blockiert ────────────────────────────────────────────

router.get('/api/nutzer/blockiert', requireAuth, async (req, res) => {
    const sperrerId = String(req.session.userId);

    try {
        const result = await pool.query(
            `SELECT n.benutzername, b.gesperrt_am, b.grund
             FROM gemeinschafts_nutzer_blocker b
             JOIN nutzer n ON n.id = b.gesperrter_id::integer
             WHERE b.sperrer_id = $1
             ORDER BY b.gesperrt_am DESC`,
            [sperrerId]
        );
        res.json(result.rows);
    } catch (err) {
        console.error('❌ [BLOCKER] blockiert-Liste Fehler:', err.message);
        res.status(500).json([]);
    }
});

module.exports = router;