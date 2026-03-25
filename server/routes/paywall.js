/**
 * Paywall Radar API
 */
const router = require('express').Router();
const { apiLimiter } = require('../../config/rate-limiter');
const requireAuth = require('../middleware/requireAuth');
const paywallManager = require('../../data/paywall-manager');

router.post('/api/paywall', requireAuth, apiLimiter, async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL fehlt' });
    console.log(`[PAYWALL] Meldung empfangen: ${url}`);

    try {
        await paywallManager.addReport(url, req.session.userId);
        res.json({ success: true });
    } catch (e) {
        console.error('Paywall Report Error:', e);
        res.status(500).json({ error: 'Fehler beim Speichern' });
    }
});

router.post('/api/paywall/status', async (req, res) => {
    const { urls } = req.body;
    if (!urls || !Array.isArray(urls)) return res.json({});

    try {
        const counts = await paywallManager.getPaywallCounts(urls);
        res.json(counts);
    } catch (e) {
        res.json({});
    }
});

module.exports = router;
