/**
 * Admin-Routen: Analytics, Security-Logs, Export, Trust, Health
 */
const router = require('express').Router();
const eventTracker = require('../../modules/event-tracker');
const { loadDatabase } = require('../helpers/db-helpers');

/**
 * GET /api/admin/test-data
 * TEST-ENDPOINT: Generiert Dummy-Daten für Testing
 */
router.get('/api/admin/test-data', (req, res) => {
    // Generiere 50 Test-Suchen
    const queries = ['Wetter', 'Nachrichten', 'Rezepte', 'Anleitung', 'Tutorial', 'Tipps', 'Test'];
    const tabs = ['Alles', 'Bilder', 'Videos', 'Nachrichten', 'Fragen'];
    
    for (let i = 0; i < 50; i++) {
        const query = queries[Math.floor(Math.random() * queries.length)];
        const tab = tabs[Math.floor(Math.random() * tabs.length)];
        const results = Math.floor(Math.random() * 1000) + 1;
        const duration = Math.floor(Math.random() * 800) + 50;
        
        eventTracker.trackSearch(query, Array(results).fill({}), duration, tab);
    }
    
    // Generiere 10 Security Events
    const securityTypes = ['rate-limit', 'suspicious-query', 'spam-detected', 'invalid-input'];
    for (let i = 0; i < 10; i++) {
        const type = securityTypes[Math.floor(Math.random() * securityTypes.length)];
        eventTracker.trackSecurityEvent(type, 'Test event', '127.0.0.1', 'warning');
    }
    
    // Generiere Performance Daten
    for (let i = 0; i < 30; i++) {
        eventTracker.trackPerformance('/search', Math.floor(Math.random() * 200) + 30, 200);
    }
    
    res.json({ 
        success: true, 
        message: '✅ Test-Daten generiert! Bitte Seite refreshen.',
        dataCount: {
            searches: eventTracker.searchHistory.length,
            security: eventTracker.securityEvents.length,
            performance: eventTracker.performanceMetrics.length
        }
    });
});

/**
 * GET /api/admin/analytics
 * Admin Dashboard - Analytics Daten
 */
router.get('/api/admin/analytics', (req, res) => {
    try {
        const summary = eventTracker.getAnalyticsSummary();
        const topSearches = eventTracker.getTopSearches(20);
        const securityEvents = eventTracker.getSecurityEvents(50);
        const performance = eventTracker.getPerformanceStats();
        const searchHistory = eventTracker.getSearchHistory(100);

        res.json({
            summary,
            topSearches,
            securityEvents,
            performance,
            searchHistory
        });
    } catch (error) {
        console.error('❌ Admin Analytics Error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * GET /api/admin/security-logs
 * Admin Dashboard - Nur Security Logs
 */
router.get('/api/admin/security-logs', (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit || '100'), 1000);
        const events = eventTracker.getSecurityEvents(limit);
        res.json({ events });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch security logs' });
    }
});

/**
 * GET /api/admin/export
 * Admin Dashboard - Export Daten (für Backup)
 */
router.get('/api/admin/export', (req, res) => {
    try {
        const data = eventTracker.export();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="luma-admin-export.json"');
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to export data' });
    }
});

/**
 * GET /api/admin/trust
 * Admin Dashboard - Trust & Domain Analytics
 */
router.get('/api/admin/trust', async (req, res) => {
    try {
        // Supabase laden (nutzt TTL-Cache)
        const db = await loadDatabase();

        const domainMap = new Map();

        db.forEach(page => {
            try {
                if (!page.url) return;
                const hostname = new URL(page.url).hostname;

                if (!domainMap.has(hostname)) {
                    domainMap.set(hostname, {
                        domain: hostname,
                        pageCount: 0,
                        totalTrust: 0,
                        totalEat: 0,
                        secureCount: 0,
                        lastCrawled: 0
                    });
                }

                const stats = domainMap.get(hostname);
                stats.pageCount++;

                // Supabase snake_case: domain_trust, eat_score, is_secure, published_date
                let trust = page.domain_trust || 0;
                stats.totalTrust += trust;
                stats.totalEat += (page.eat_score || 0);
                if (page.is_secure !== false) stats.secureCount++;

                // Datum prüfen — Supabase: published_date
                const date = page.published_date ? new Date(page.published_date).getTime() : 0;
                if (!isNaN(date) && date > stats.lastCrawled) stats.lastCrawled = date;
            } catch (e) {
                // URL Fehler ignorieren
            }
        });

        const domains = Array.from(domainMap.values()).map(d => ({
            domain: d.domain,
            pages: d.pageCount,
            trustScore: Math.round((d.totalTrust / d.pageCount) * 100), // domain_trust ist 0-1
            eatScore: Math.round(d.totalEat / d.pageCount),
            httpsCoverage: Math.round((d.secureCount / d.pageCount) * 100),
            lastUpdate: d.lastCrawled || Date.now()
        })).sort((a, b) => b.trustScore - a.trustScore);

        res.json({
            totalDomains: domains.length,
            avgNetworkTrust: domains.length ? Math.round(domains.reduce((s, d) => s + d.trustScore, 0) / domains.length) : 0,
            domains
        });
    } catch (error) {
        console.error('❌ Admin Trust API Error:', error);
        res.status(500).json({ error: 'Failed to fetch trust analytics' });
    }
});

/**
 * GET /api/admin/health
 * Admin Dashboard - Health Check
 */
router.get('/api/admin/health', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        eventCount: eventTracker.searchHistory.length + eventTracker.securityEvents.length
    });
});

module.exports = router;
