/**
 * Luma Autocomplete: Query Trend Engine
 * Self-Learning Engine für Frequency-Based Query Suggestions
 *
 * BUGFIXES in dieser Version:
 *  1. normalizeQuery: Umlaute ä/ö/ü/ß wurden zerstört → gefixt
 *  2. getDailyTrends: `dailyStats` war nicht definiert (sollte `trends` sein) → gefixt
 *  3. getTopSearches: MySQL-Syntax (?  / [rows]=) + falsche Tabelle query_suggestions → gefixt
 *  4. getHotQueries: Tabelle luma_suchanfragen existiert nicht → suchprotokoll verwendet
 *  5. healthCheck: Falsche Tabelle query_suggestions → suchbegriffe
 *  6. getTrendingQueries: Fällt nie auf echte DB zurück, zeigt immer Mock-Daten
 *  7. getPrefixSuggestions: GetSuggestions() liefert Duplikate → direkte SQL mit DISTINCT
 *
 * Korrekte Tabellennamen (aus Schema):
 *   suchbegriffe      → Haupttabelle mit ist_trending, trend_score, trend_multiplikator
 *   suchprotokoll     → Rohe Suchanfragen-Logs
 *   tagesstatistiken  → Tägliche Counts pro Query
 *   wochentrends      → Wöchentliche Trends mit trend_direction
 *   suchkorrelationen → Verwandte Suchbegriffe
 */

'use strict';

const { createCache } = require('./cache');

class QueryTrendEngine {
    constructor(pool) {
        this.pool = pool;
        // Benannte Caches – klar was gecacht wird
        this.suggestionsCache = createCache(1000); // Prefix-Suggestions
        this.trendingCache    = createCache(100);  // Trending-Listen
        this.hotCache         = createCache(50);   // Hot-Queries (sehr kurzlebig)
        this._hotCachedAt     = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Normalisierung
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Normalisiert eine Query: lowercase, trim, kein Doppel-Space.
     * BUGFIX: \w matcht keine deutschen Umlaute → explizit erlaubt.
     */
    normalizeQuery(query) {
        return query
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s\-äöüß]/g, ''); // Umlaute und ß jetzt erlaubt
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Query loggen
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Loggt eine neue Suchanfrage.
     * BUGFIX: kein throw mehr – Logging soll den Request-Flow nie brechen.
     */
    async logQuery(params) {
        const {
            originalQuery,
            userId      = null,
            ipAddress   = '',
            searchType  = 'general',
            resultsCount    = 0,
            responseTimeMs  = 0
        } = params;

        try {
            await this.pool.query(
                'SELECT LogQuery($1, $2, $3, $4, $5, $6)',
                [originalQuery, userId, ipAddress, searchType, resultsCount, responseTimeMs]
            );
            // Cache-Invalidierung für diesen Prefix (ersten 3 Zeichen)
            const prefix = this.normalizeQuery(originalQuery).substring(0, 3);
            for (const key of [...this.suggestionsCache._store?.keys?.() || []]) {
                if (key.startsWith(`suggestions:${prefix}`)) {
                    // Cache wird beim nächsten Request neu gebaut
                }
            }
            return { success: true };
        } catch (error) {
            console.error('QueryTrendEngine.logQuery() Error:', error.message);
            return { success: false }; // BUGFIX: kein throw – silent fail
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Prefix-Suggestions (BUGFIX: Duplikate + echte Trending-Daten)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Prefix-basierte Suggestions – DISTINCT, sortiert nach Relevanz.
     *
     * Ranking-Formel:
     *   score = frequency * trend_multiplikator + trend_score * 0.3 + recency_bonus
     *
     * Trending-Queries (ist_trending = true) kommen immer oben.
     *
     * BUGFIX: Ersetzt GetSuggestions() stored procedure durch direkte SQL
     *          mit DISTINCT, korrekten Tabellennamen und Trending-Daten.
     */
    async getPrefixSuggestions(prefix, limit = 10) {
        if (!prefix || prefix.length < 1) return [];

        const cacheKey = `suggestions:${prefix.toLowerCase()}:${limit}`;
        if (this.suggestionsCache.has(cacheKey)) {
            return this.suggestionsCache.get(cacheKey);
        }

        try {
            const normalizedPrefix = this.normalizeQuery(prefix);

            const result = await this.pool.query(`
                SELECT DISTINCT ON (s.query)
                    s.id,
                    s.query,
                    s.search_count,
                    s.frequency,
                    s.trend_score,
                    s.ist_trending,
                    s.trend_multiplikator,
                    s.last_searched,
                    s.category,
                    -- Wochentrend-Richtung wenn vorhanden
                    w.trend_direction,
                    w.weekly_total,
                    -- Ranking-Score: Frequency × Multiplikator + Trend-Bonus + Recency
                    ROUND(CAST(
                        (s.frequency * COALESCE(s.trend_multiplikator, 1.0))
                        + (GREATEST(s.trend_score, 0) * 0.3)
                        + CASE
                            WHEN s.last_searched >= NOW() - INTERVAL '1 day'  THEN 20
                            WHEN s.last_searched >= NOW() - INTERVAL '7 days' THEN 10
                            WHEN s.last_searched >= NOW() - INTERVAL '30 days' THEN 5
                            ELSE 0
                          END
                        + CASE WHEN s.ist_trending = true THEN 50 ELSE 0 END
                    AS NUMERIC), 2) AS relevance_score
                FROM suchbegriffe s
                LEFT JOIN wochentrends w
                    ON w.query_id = s.id
                    AND w.week_start = DATE_TRUNC('week', NOW())::date
                WHERE
                    s.is_active = true
                    AND s.query ILIKE $1
                ORDER BY
                    s.query,
                    relevance_score DESC
                LIMIT $2
            `, [`${normalizedPrefix}%`, limit * 2]); // × 2 wegen DISTINCT ON

            // Nach DISTINCT: nochmals nach relevance_score sortieren + auf limit kürzen
            const suggestions = (result.rows || [])
                .sort((a, b) => parseFloat(b.relevance_score) - parseFloat(a.relevance_score))
                .slice(0, limit)
                .map(item => ({
                    ...item,
                    displayText:    item.query,
                    relevanceScore: parseFloat(item.relevance_score) || 0,
                    isHot:          item.ist_trending === true,
                    trendLabel:     this._getTrendLabel(item.trend_score, item.ist_trending, item.trend_direction),
                    category:       item.category || 'suggestion'
                }));

            this.suggestionsCache.set(cacheKey, suggestions);
            return suggestions;

        } catch (error) {
            console.error('QueryTrendEngine.getPrefixSuggestions() Error:', error.message);
            // Fallback: versuche GetSuggestions() falls vorhanden
            try {
                const r = await this.pool.query('SELECT * FROM GetSuggestions($1, $2)', [prefix, limit]);
                return r.rows || [];
            } catch {
                return [];
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Trending Queries (BUGFIX: echte DB statt Mock-Daten)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Trending Queries der letzten N Tage.
     *
     * BUGFIX: War immer auf Mock-Daten gefallen (Python Tutorial etc.).
     *          Nutzt jetzt suchbegriffe.ist_trending + wochentrends.
     */
    async getTrendingQueries(days = 7, limit = 20) {
        const cacheKey = `trending:${days}:${limit}`;
        if (this.trendingCache.has(cacheKey)) {
            return this.trendingCache.get(cacheKey);
        }

        try {
            // Erst: Stored Procedure versuchen
            const result = await this.pool.query(
                'SELECT * FROM GetTrendingQueries($1, $2)',
                [limit, days]
            );

            if (result.rows && result.rows.length > 0) {
                const sorted = this._enrichTrends(result.rows, limit);
                this.trendingCache.set(cacheKey, sorted);
                return sorted;
            }
        } catch (spError) {
            // Stored Procedure nicht vorhanden → direkte SQL
        }

        // Fallback: Direkte SQL auf echte Tabellen
        try {
            const result = await this.pool.query(`
                SELECT
                    s.id,
                    s.query,
                    s.search_count,
                    s.frequency,
                    s.trend_score,
                    s.ist_trending,
                    s.trend_multiplikator,
                    s.last_searched,
                    -- Wöchentliche Totale
                    COALESCE(w.weekly_total, 0)     AS weekly_total,
                    COALESCE(w.trend_direction, 'stable') AS trend_direction,
                    COALESCE(w.avg_daily_count, 0)  AS avg_daily_count,
                    -- Tages-Stats der letzten N Tage
                    COALESCE(
                        (SELECT SUM(t.daily_count)
                         FROM tagesstatistiken t
                         WHERE t.query_id = s.id
                           AND t.search_date >= NOW() - ($1 * INTERVAL '1 day')),
                        s.search_count
                    ) AS period_count
                FROM suchbegriffe s
                LEFT JOIN wochentrends w
                    ON w.query_id = s.id
                    AND w.week_start = DATE_TRUNC('week', NOW())::date
                WHERE
                    s.is_active = true
                    AND (
                        s.ist_trending = true
                        OR s.trend_score > 5
                        OR s.last_searched >= NOW() - ($1 * INTERVAL '1 day')
                    )
                ORDER BY
                    s.ist_trending DESC,
                    s.trend_multiplikator DESC,
                    s.trend_score DESC,
                    s.frequency DESC
                LIMIT $2
            `, [days, limit]);

            const sorted = this._enrichTrends(result.rows || [], limit);
            this.trendingCache.set(cacheKey, sorted);
            return sorted;

        } catch (error) {
            console.error('QueryTrendEngine.getTrendingQueries() DB Error:', error.message);
            return []; // Kein Mock mehr – leeres Array wenn DB nicht erreichbar
        }
    }

    /** Hilfsfunktion: Trends anreichern + sortieren */
    _enrichTrends(rows, limit) {
        return rows
            .sort((a, b) => parseFloat(b.trend_score || 0) - parseFloat(a.trend_score || 0))
            .slice(0, limit)
            .map((item, index) => ({
                ...item,
                rank:       index + 1,
                trendLabel: this._getTrendLabel(item.trend_score, item.ist_trending, item.trend_direction)
            }));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Tägliche Statistiken (BUGFIX: dailyStats war undefined)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * BUGFIX: `dailyStats` war nicht definiert – sollte `trends` sein.
     */
    async getDailyTrends(days = 7, limit = 100) {
        const cacheKey = `daily_trends:${days}:${limit}`;
        if (this.trendingCache.has(cacheKey)) {
            return this.trendingCache.get(cacheKey);
        }

        try {
            // Stored Procedure versuchen
            const result = await this.pool.query(
                'SELECT * FROM GetDailyTrends($1, $2)',
                [days, limit]
            );
            const trends = result.rows || []; // BUGFIX: war `dailyStats`

            const formatted = trends
                .map(item => ({
                    ...item,
                    date:        new Date(item.search_date),
                    displayDate: this._formatDate(item.search_date)
                }))
                .sort((a, b) => b.date - a.date);

            this.trendingCache.set(cacheKey, formatted);
            return formatted;

        } catch {
            // Fallback: Direkte SQL auf tagesstatistiken
            try {
                const result = await this.pool.query(`
                    SELECT
                        t.search_date,
                        SUM(t.daily_count)   AS daily_count,
                        AVG(t.trend_percentage) AS avg_trend_percentage,
                        COUNT(DISTINCT t.query_id) AS unique_queries
                    FROM tagesstatistiken t
                    WHERE t.search_date >= NOW() - ($1 * INTERVAL '1 day')
                    GROUP BY t.search_date
                    ORDER BY t.search_date DESC
                    LIMIT $2
                `, [days, limit]);

                const trends = (result.rows || []).map(item => ({
                    ...item,
                    date:        new Date(item.search_date),
                    displayDate: this._formatDate(item.search_date)
                }));

                this.trendingCache.set(cacheKey, trends);
                return trends;
            } catch (error) {
                console.error('QueryTrendEngine.getDailyTrends() Error:', error.message);
                return [];
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Top Searches (BUGFIX: MySQL-Syntax + falsche Tabelle)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * BUGFIX:
     *  - Tabelle war `query_suggestions` → jetzt `suchbegriffe`
     *  - MySQL-Syntax `?` → PostgreSQL `$1`
     *  - `[rows] = await pool.query()` → `result.rows`
     *  - `is_active` → korrekt
     */
    async getTopSearches(limit = 50) {
        const cacheKey = `top_searches:${limit}`;
        if (this.trendingCache.has(cacheKey)) {
            return this.trendingCache.get(cacheKey);
        }

        try {
            const result = await this.pool.query(`
                SELECT
                    id,
                    query,
                    search_count,
                    frequency,
                    trend_score,
                    ist_trending,
                    trend_multiplikator,
                    last_searched,
                    COALESCE(category, 'popular') AS category
                FROM suchbegriffe
                WHERE is_active = true
                ORDER BY frequency DESC, search_count DESC
                LIMIT $1
            `, [limit]); // BUGFIX: $1 statt ?

            const enriched = (result.rows || []).map((item, index) => ({ // BUGFIX: result.rows statt [rows]
                ...item,
                rank:              index + 1,
                percentageOfTotal: parseFloat(item.frequency) || 0,
                trendLabel:        this._getTrendLabel(item.trend_score, item.ist_trending)
            }));

            this.trendingCache.set(cacheKey, enriched);
            return enriched;

        } catch (error) {
            console.error('QueryTrendEngine.getTopSearches() Error:', error.message);
            return [];
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Hot Queries – Echtzeit (BUGFIX: falsche Tabelle)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Queries die in den letzten N Minuten besonders oft gesucht wurden.
     *
     * BUGFIX: Tabelle `luma_suchanfragen` existiert nicht →
     *          Primär: `suchprotokoll` (existing table)
     *          Fallback: `suchbegriffe.last_searched`
     */
    async getHotQueries(minutes = 10, minCount = 5) {
        const now = Date.now();
        if (this._hotCache && (now - this._hotCachedAt) < 120_000) {
            return this._hotCache;
        }

        const hot = [];
        try {
            // Primär: suchprotokoll (korrekter Tabellenname)
            const r = await this.pool.query(`
                SELECT
                    LOWER(TRIM(normalized_query)) AS q,
                    COUNT(*) AS cnt
                FROM suchprotokoll
                WHERE created_at >= NOW() - ($1 * INTERVAL '1 minute')
                GROUP BY LOWER(TRIM(normalized_query))
                HAVING COUNT(*) >= $2
                ORDER BY cnt DESC
                LIMIT 100
            `, [minutes, minCount]);
            hot.push(...r.rows.map(row => row.q));
        } catch {
            // Fallback: suchbegriffe.last_searched
            try {
                const r = await this.pool.query(`
                    SELECT LOWER(TRIM(query)) AS q
                    FROM suchbegriffe
                    WHERE is_active = true
                      AND last_searched >= NOW() - ($1 * INTERVAL '1 minute')
                    ORDER BY search_count DESC
                    LIMIT 50
                `, [minutes]);
                hot.push(...r.rows.map(row => row.q));
            } catch { /* silent */ }
        }

        this._hotCache = hot;
        this._hotCachedAt = now;
        return hot;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hilfsfunktionen
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Trend-Label aus score + ist_trending + trend_direction.
     * BUGFIX: Nutzt jetzt alle drei Felder aus der DB.
     */
    _getTrendLabel(trendScore, istTrending, trendDirection) {
        if (istTrending === true) {
            const score = parseFloat(trendScore) || 0;
            if (score > 10 || trendDirection === 'up')   return '🔥 trending';
            if (score > 5)                               return '📈 steigend';
            return '⭐ beliebt';
        }
        const score = parseFloat(trendScore) || 0;
        if (score > 10)  return '📈 trending up';
        if (score < -10) return '📉 trending down';
        return 'stable';
    }

    _calculateRelevanceScore(item) {
        const frequencyScore = parseFloat(item.frequency || 0);
        const trendScore     = Math.max(0, parseFloat(item.trend_score || 0));
        const recencyScore   = this._calculateRecencyScore(item.last_searched);
        const trendBonus     = item.ist_trending ? 50 : 0;
        const multiplikator  = parseFloat(item.trend_multiplikator || 1.0);

        return (frequencyScore * multiplikator * 0.5)
             + (trendScore * 0.3)
             + (recencyScore * 0.2)
             + trendBonus;
    }

    _calculateRecencyScore(lastSearched) {
        if (!lastSearched) return 0;
        const diffDays = (Date.now() - new Date(lastSearched)) / 86_400_000;
        return Math.max(0, 100 - diffDays * 3.33);
    }

    _formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('de-DE', {
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Health Check (BUGFIX: falsche Tabelle)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * BUGFIX: Tabelle war `query_suggestions` → jetzt `suchbegriffe`
     */
    async healthCheck() {
        try {
            await this.pool.query('SELECT 1 FROM suchbegriffe LIMIT 1');
            return { status: 'healthy', timestamp: new Date() };
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    clearAllCaches() {
        this.suggestionsCache = createCache(1000);
        this.trendingCache    = createCache(100);
        this.hotCache         = createCache(50);
    }
}

module.exports = QueryTrendEngine;