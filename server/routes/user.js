/**
 * User-Routen: URL-Blacklist, Account-Info, öffentliche Statistiken
 */
const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const { apiLimiter } = require('../../config/rate-limiter');
const authManager = require('../../data/auth-manager');
const { pool: sessionPool } = require('../../crawler_new/db.js');

// ============================================================
// URL-BLACKLIST API (nur für angemeldete Nutzer)
// ============================================================

/**
 * GET /api/blacklist
 * Gibt alle gesperrten URLs des Nutzers zurück
 */
router.get('/api/blacklist', requireAuth, async (req, res) => {
    try {
        const list = await authManager.getBlacklist(req.session.userId);
        res.json({ success: true, items: list });
    } catch (err) {
        console.error('Blacklist GET Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Laden der Blacklist.' });
    }
});

/**
 * POST /api/blacklist
 * Body: { url }
 */
router.post('/api/blacklist', requireAuth, apiLimiter, async (req, res) => {
    const { url } = req.body;
    if (!url || url.trim().length === 0)
        return res.status(400).json({ error: 'URL fehlt.' });
    if (url.length > 2048)
        return res.status(400).json({ error: 'URL zu lang.' });

    try {
        const entry = await authManager.addToBlacklist(req.session.userId, url);
        if (!entry)
            return res.status(409).json({ error: 'Diese URL ist bereits in deiner Blacklist.' });
        res.json({ success: true, item: entry });
    } catch (err) {
        console.error('Blacklist POST Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Hinzufügen.' });
    }
});

/**
 * DELETE /api/blacklist/:id
 */
router.delete('/api/blacklist/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige ID.' });

    try {
        const deleted = await authManager.removeFromBlacklist(req.session.userId, id);
        if (!deleted) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Blacklist DELETE Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Löschen.' });
    }
});

// ============================================================
// URL-WHITELIST API (nur für angemeldete Nutzer)
// ============================================================

/**
 * GET /api/whitelist
 * Gibt alle erlaubten Domains des Nutzers zurück
 */
router.get('/api/whitelist', requireAuth, async (req, res) => {
    try {
        const list = await authManager.getWhitelist(req.session.userId);
        res.json({ success: true, items: list });
    } catch (err) {
        console.error('Whitelist GET Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Laden der Whitelist.' });
    }
});

/**
 * POST /api/whitelist
 * Body: { url }
 */
router.post('/api/whitelist', requireAuth, apiLimiter, async (req, res) => {
    const { url } = req.body;
    if (!url || url.trim().length === 0)
        return res.status(400).json({ error: 'URL fehlt.' });
    if (url.length > 2048)
        return res.status(400).json({ error: 'URL zu lang.' });

    try {
        const entry = await authManager.addToWhitelist(req.session.userId, url);
        if (!entry)
            return res.status(409).json({ error: 'Diese Domain ist bereits in deiner Whitelist.' });
        res.json({ success: true, item: entry });
    } catch (err) {
        console.error('Whitelist POST Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Hinzufügen.' });
    }
});

/**
 * DELETE /api/whitelist/:id
 */
router.delete('/api/whitelist/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige ID.' });

    try {
        const deleted = await authManager.removeFromWhitelist(req.session.userId, id);
        if (!deleted) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
        res.json({ success: true });
    } catch (err) {
        console.error('Whitelist DELETE Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Löschen.' });
    }
});

// ============================================================
// NUTZER-EINSTELLUNGEN (Cloud-Sync)
// ============================================================

/**
 * GET /api/user/preferences
 * Gibt alle gespeicherten Einstellungen des Nutzers zurück.
 */
router.get('/api/user/preferences', requireAuth, async (req, res) => {
    try {
        const { rows } = await sessionPool.query(
            'SELECT einstellungen FROM nutzer WHERE id = $1',
            [req.session.userId]
        );
        res.json({ success: true, preferences: rows[0]?.einstellungen || {} });
    } catch (err) {
        console.error('Preferences GET Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Laden der Einstellungen.' });
    }
});

/**
 * PUT /api/user/preferences
 * Body: beliebiges JSON-Objekt — wird mit bestehenden Einstellungen gemergt.
 */
router.put('/api/user/preferences', requireAuth, async (req, res) => {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming))
        return res.status(400).json({ error: 'Ungültiges Format.' });

    // Sicherheit: Maximale Größe begrenzen (50 KB)
    if (JSON.stringify(incoming).length > 50000)
        return res.status(400).json({ error: 'Einstellungen zu groß.' });

    try {
        const { rows } = await sessionPool.query(
            `UPDATE nutzer
             SET einstellungen = COALESCE(einstellungen, '{}'::jsonb) || $1::jsonb
             WHERE id = $2
             RETURNING einstellungen`,
            [JSON.stringify(incoming), req.session.userId]
        );
        res.json({ success: true, preferences: rows[0]?.einstellungen });
    } catch (err) {
        console.error('Preferences PUT Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Speichern der Einstellungen.' });
    }
});

// ============================================================
// ACCOUNT & ÖFFENTLICHE STATISTIK
// ============================================================

/**
 * GET /api/account
 * Vollständige Kontoinformationen für den angemeldeten Nutzer
 */
router.get('/api/account', requireAuth, async (req, res) => {
    try {
        const user      = await authManager.findUserById(req.session.userId);
        const blacklist = await authManager.getBlacklist(req.session.userId);
        if (!user) return res.status(404).json({ error: 'Nutzer nicht gefunden.' });
        res.json({
            success:        true,
            benutzername:   user.benutzername,
            email:          user.email,
            createdAt:      user.erstellt_am,
            blacklistCount: blacklist.length
        });
    } catch (err) {
        console.error('Account Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Laden des Kontos.' });
    }
});

/**
 * GET /api/stats/blocked
 * Öffentliche Statistik: meistblockierte Domains über alle Nutzer
 */
router.get('/api/stats/blocked', async (_req, res) => {
    try {
        const result = await sessionPool.query(`
            SELECT url_muster                           AS domain,
                   COUNT(DISTINCT nutzer_id)::int       AS count
            FROM   nutzer_url_blacklist
            GROUP  BY url_muster
            ORDER  BY count DESC
            LIMIT  200
        `);
        const totalBlocks  = result.rows.reduce((s, r) => s + r.count, 0);
        const totalDomains = result.rows.length;
        res.json({ success: true, items: result.rows, totalDomains, totalBlocks });
    } catch (err) {
        console.error('Stats/blocked Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Laden der Statistiken.' });
    }
});

/**
 * GET /api/stats/votes
 * Öffentliche Statistik: Community-Bewertungen (positiv/neutral/negativ)
 */
router.get('/api/stats/votes', async (req, res) => {
    try {
        const result = await sessionPool.query(`
            SELECT domain, positive, neutral, negative, (positive + neutral + negative) as total
            FROM   luma_domain_votes
            WHERE  (positive + neutral + negative) > 0
            ORDER  BY total DESC LIMIT 500
        `);
        const totalPositive = result.rows.reduce((s, r) => s + r.positive, 0);
        const totalNegative = result.rows.reduce((s, r) => s + r.negative, 0);
        const totalDomains = result.rows.length;

        res.json({
            success: true,
            items: result.rows,
            totalDomains,
            totalPositive,
            totalNegative
        });
    } catch (err) {
        console.error('Stats/votes Fehler:', err.message);
        res.status(500).json({ error: 'Fehler beim Laden der Statistiken.' });
    }
});

module.exports = router;
