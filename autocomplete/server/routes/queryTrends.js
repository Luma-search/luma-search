/**
 * Luma Autocomplete: Routes für Query Trend System
 * 
 * Endpoints:
 * - GET /api/query-suggestions?q=prefix - Prefix-basierte Suggestions mit Frequency Ranking
 * - GET /api/trending-queries?days=7&limit=20 - Trending Queries mit Trend-Analyse
 * - GET /api/daily-trends?days=7 - Tägliche Statistiken
 * - GET /api/top-searches - Top 50 Suchbegriffe
 * - POST /api/log-query - Eine Query loggen (intern per autocomplete.js)
 */

'use strict';

module.exports = function registerQueryTrendRoute(app, { queryTrendEngine, getClientIp }) {
    
    /**
     * GET /api/query-suggestions
     * Prefix-Search mit Frequency-based Ranking
     * Das ist der Hauptendpoint für die Autocomplete-Engine
     */
    app.get('/api/query-suggestions', async (req, res) => {
        try {
            const { q = '', limit = 10 } = req.query;

            // Input-Validierung
            if (!q || q.length < 1) {
                return res.json({
                    suggestions: [],
                    meta: { query: q, limit: parseInt(limit) }
                });
            }

            const numLimit = Math.min(parseInt(limit) || 10, 50); // Max 50

            // Hole Suggestions aus Engine
            const suggestions = await queryTrendEngine.getPrefixSuggestions(q, numLimit);

            // Logge diese Query asynchron (non-blocking)
            queryTrendEngine.logQuery({
                originalQuery: q,
                userId: null, // Könnte per Session gesetzt werden
                ipAddress: getClientIp(req),
                searchType: 'suggestion_request',
                resultsCount: suggestions.length,
                responseTimeMs: 0
            }).catch(err => console.error('Failed to log suggestion query:', err));

            res.json({
                success: true,
                suggestions,
                meta: {
                    query: q,
                    count: suggestions.length,
                    limit: numLimit,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('/api/query-suggestions Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch suggestions'
            });
        }
    });

    /**
     * GET /api/trending-queries
     * Trending Queries basierend auf Tage und Trend-Score
     */
    app.get('/api/trending-queries', async (req, res) => {
        try {
            const { days = 7, limit = 20 } = req.query;

            const numDays = Math.min(parseInt(days) || 7, 90); // Max 90 Tage
            const numLimit = Math.min(parseInt(limit) || 20, 100); // Max 100

            const trends = await queryTrendEngine.getTrendingQueries(numDays, numLimit);

            res.json({
                success: true,
                trends,
                meta: {
                    days: numDays,
                    limit: numLimit,
                    count: trends.length,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('/api/trending-queries Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch trending queries'
            });
        }
    });

    /**
     * GET /api/daily-trends
     * Tägliche Statistiken für Trend-Visualisierung
     */
    app.get('/api/daily-trends', async (req, res) => {
        try {
            const { days = 7, limit = 100 } = req.query;

            const numDays = Math.min(parseInt(days) || 7, 90);
            const numLimit = Math.min(parseInt(limit) || 100, 500);

            const dailyStats = await queryTrendEngine.getDailyTrends(numDays, numLimit);

            // Gruppiere nach Datum für bessere Visualisierung
            const groupedByDate = {};
            dailyStats.forEach(stat => {
                const dateKey = stat.displayDate;
                if (!groupedByDate[dateKey]) {
                    groupedByDate[dateKey] = {
                        date: dateKey,
                        queries: []
                    };
                }
                groupedByDate[dateKey].queries.push({
                    query: stat.query,
                    count: stat.daily_count,
                    frepuncy: stat.frequency,
                    trend: stat.trend_score
                });
            });

            res.json({
                success: true,
                dailyTrends: Object.values(groupedByDate),
                meta: {
                    days: numDays,
                    totalEntries: dailyStats.length,
                    dateRange: {
                        from: dailyStats[dailyStats.length - 1]?.displayDate,
                        to: dailyStats[0]?.displayDate
                    },
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('/api/daily-trends Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch daily trends'
            });
        }
    });

    /**
     * GET /api/top-searches
     * Top 50 meistgesuchte Begriffe
     */
    app.get('/api/top-searches', async (req, res) => {
        try {
            const { limit = 50 } = req.query;

            const numLimit = Math.min(parseInt(limit) || 50, 200);

            const topSearches = await queryTrendEngine.getTopSearches(numLimit);

            res.json({
                success: true,
                topSearches,
                meta: {
                    limit: numLimit,
                    count: topSearches.length,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('/api/top-searches Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch top searches'
            });
        }
    });

    /**
     * POST /api/log-query
     * Manuelles Loggen einer Query
     * Wird von autocomplete.js aufgerufen, nachdem ein Nutzer etwas eingegeben/gesucht hat
     */
    app.post('/api/log-query', async (req, res) => {
        try {
            const {
                query,
                searchType = 'search',
                resultsCount = 0,
                responseTimeMs = 0
            } = req.body;

            if (!query || query.trim().length < 1) {
                return res.status(400).json({
                    success: false,
                    error: 'Query parameter required'
                });
            }

            // Logge die Query
            await queryTrendEngine.logQuery({
                originalQuery: query,
                userId: null,
                ipAddress: getClientIp(req),
                searchType,
                resultsCount,
                responseTimeMs
            });

            res.json({
                success: true,
                message: 'Query logged successfully'
            });

        } catch (error) {
            console.error('/api/log-query Error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to log query'
            });
        }
    });

    /**
     * GET /api/hot-queries?minutes=10&minCount=5
     * Liefert Begriffe, die im angegebenen Zeitfenster extrem oft gesucht wurden.
     * Wird vom Frontend genutzt, um den 🔥 Trend-Indikator anzuzeigen.
     */
    app.get('/api/hot-queries', async (req, res) => {
        try {
            const minutes  = Math.min(parseInt(req.query.minutes)  || 10, 60);  // Max 1 Stunde
            const minCount = Math.min(parseInt(req.query.minCount) || 5,  100); // Max-Schwelle

            const hotQueries = await queryTrendEngine.getHotQueries(minutes, minCount);

            res.json({
                success: true,
                queries: hotQueries,
                meta: {
                    minutes,
                    minCount,
                    count: hotQueries.length,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('/api/hot-queries Error:', error);
            res.json({ success: false, queries: [] });
        }
    });

    /**
     * GET /api/trends/health
     * Healthcheck für Query Trend System
     */
    app.get('/api/trends/health', async (req, res) => {
        try {
            const health = await queryTrendEngine.healthCheck();

            if (health.status === 'healthy') {
                res.json(health);
            } else {
                res.status(503).json(health);
            }

        } catch (error) {
            console.error('/api/trends/health Error:', error);
            res.status(503).json({
                status: 'unhealthy',
                error: error.message
            });
        }
    });

};
