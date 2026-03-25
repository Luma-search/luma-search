/**
 * EVENT TRACKING & LOGGING MODULE
 * Verfolgt Suchanfragen, Security Events, Performance Daten
 */

class EventTracker {
    constructor() {
        this.maxEvents = 5000; // Max 5000 Events in Memory
        this.searchHistory = [];
        this.securityEvents = [];
        this.performanceMetrics = [];
    }

    /**
     * Tracke eine Suchanfrage
     */
    trackSearch(query, results, duration, tab = 'Alles') {
        this.searchHistory.push({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            query: query.substring(0, 100), // Max 100 Zeichen
            resultsCount: results.length,
            duration: duration,
            tab: tab,
            dayOfWeek: new Date().toLocaleDateString('de-DE', { weekday: 'long' })
        });

        // Limit auf maxEvents
        if (this.searchHistory.length > this.maxEvents) {
            this.searchHistory.shift();
        }
    }

    /**
     * Tracke Security Events
     */
    trackSecurityEvent(type, details, ip, severity = 'warning') {
        this.securityEvents.push({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            type: type, // 'rate_limit', 'sql_injection', 'xss_attempt', 'login_failure', etc.
            details: details,
            ip: ip,
            severity: severity // 'info', 'warning', 'critical'
        });

        // Limit auf maxEvents
        if (this.securityEvents.length > this.maxEvents) {
            this.securityEvents.shift();
        }

        // Log kritische Events
        if (severity === 'critical') {
            console.error(`🚨 [CRITICAL] ${type}: ${details} from ${ip}`);
        }
    }

    /**
     * Tracke Performance Metriken
     */
    trackPerformance(endpoint, duration, statusCode) {
        this.performanceMetrics.push({
            timestamp: new Date().toISOString(),
            endpoint: endpoint,
            duration: duration,
            statusCode: statusCode
        });

        if (this.performanceMetrics.length > this.maxEvents) {
            this.performanceMetrics.shift();
        }
    }

    /**
     * Hole Top Search Queries (nach Häufigkeit)
     */
    getTopSearches(limit = 20) {
        const queryMap = {};

        this.searchHistory.forEach(entry => {
            if (!queryMap[entry.query]) {
                queryMap[entry.query] = {
                    query: entry.query,
                    count: 0,
                    totalDuration: 0,
                    totalResults: 0,
                    avgDuration: 0,
                    lastSearch: entry.timestamp,
                    avgResults: 0
                };
            }
            queryMap[entry.query].count++;
            queryMap[entry.query].totalDuration += entry.duration;
            queryMap[entry.query].totalResults += entry.resultsCount;
            queryMap[entry.query].lastSearch = entry.timestamp;
        });

        return Object.values(queryMap)
            .map(item => ({
                ...item,
                avgDuration: Math.round(item.totalDuration / item.count),
                avgResults: Math.round(item.totalResults / item.count)
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Hole Analytics Summary
     */
    getAnalyticsSummary() {
        const now = Date.now();
        const last24h = now - (24 * 60 * 60 * 1000);
        const last7d = now - (7 * 24 * 60 * 60 * 1000);

        // Filter letzte 24h & 7 Tage
        const searches24h = this.searchHistory.filter(s => new Date(s.timestamp).getTime() > last24h);
        const searches7d = this.searchHistory.filter(s => new Date(s.timestamp).getTime() > last7d);
        const security24h = this.securityEvents.filter(s => new Date(s.timestamp).getTime() > last24h);

        // Berechne Metriken
        const avgDuration = searches24h.length > 0
            ? Math.round(searches24h.reduce((sum, s) => sum + s.duration, 0) / searches24h.length)
            : 0;

        const avgResults = searches24h.length > 0
            ? Math.round(searches24h.reduce((sum, s) => sum + s.resultsCount, 0) / searches24h.length)
            : 0;

        const peakHour = this.getPeakHour();

        return {
            totalSearches24h: searches24h.length,
            totalSearches7d: searches7d.length,
            totalSearchesAllTime: this.searchHistory.length,
            avgSearchDuration: avgDuration,
            avgResultsPerSearch: avgResults,
            securityEvents24h: security24h.length,
            criticalEvents: this.securityEvents.filter(e => e.severity === 'critical').length,
            topQuery: this.getTopSearches(1)[0] || null,
            peakHour: peakHour,
            cacheHitEstimate: '85%' // Placeholder - wird später mit echten Daten gefüllt
        };
    }

    /**
     * Hole Security Events (letzte N)
     */
    getSecurityEvents(limit = 50) {
        return this.securityEvents
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Hole Search History (letzte N)
     */
    getSearchHistory(limit = 100) {
        return this.searchHistory
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Hole Peak Hour (wann die meisten Searches)
     */
    getPeakHour() {
        const hourMap = {};
        
        this.searchHistory.forEach(entry => {
            const hour = new Date(entry.timestamp).getHours();
            hourMap[hour] = (hourMap[hour] || 0) + 1;
        });

        const peakHour = Object.entries(hourMap).sort((a, b) => b[1] - a[1])[0];
        return peakHour ? `${peakHour[0]}:00 Uhr (${peakHour[1]} Suchen)` : 'N/A';
    }

    /**
     * Hole Performance Stats
     */
    getPerformanceStats() {
        const endpointData = {};

        this.performanceMetrics.forEach(metric => {
            if (!endpointData[metric.endpoint]) {
                endpointData[metric.endpoint] = {
                    endpoint: metric.endpoint,
                    count: 0,
                    avgDuration: 0,
                    minDuration: Infinity,
                    maxDuration: 0,
                    totalDuration: 0
                };
            }
            endpointData[metric.endpoint].count++;
            endpointData[metric.endpoint].totalDuration += metric.duration;
            endpointData[metric.endpoint].minDuration = Math.min(
                endpointData[metric.endpoint].minDuration,
                metric.duration
            );
            endpointData[metric.endpoint].maxDuration = Math.max(
                endpointData[metric.endpoint].maxDuration,
                metric.duration
            );
        });

        return Object.values(endpointData).map(data => ({
            ...data,
            avgDuration: Math.round(data.totalDuration / data.count)
        }));
    }

    /**
     * Exporte Daten (für Testing/Backup)
     */
    export() {
        return {
            exportDate: new Date().toISOString(),
            searchHistory: this.searchHistory,
            securityEvents: this.securityEvents,
            performanceMetrics: this.performanceMetrics
        };
    }

    /**
     * Cleane alte Daten
     */
    cleanup(olderThanHours = 48) {
        const cutoff = Date.now() - (olderThanHours * 60 * 60 * 1000);

        this.searchHistory = this.searchHistory.filter(
            e => new Date(e.timestamp).getTime() > cutoff
        );
        this.securityEvents = this.securityEvents.filter(
            e => new Date(e.timestamp).getTime() > cutoff
        );
        this.performanceMetrics = this.performanceMetrics.filter(
            e => new Date(e.timestamp).getTime() > cutoff
        );
    }
}

// Global Tracker Instance
const tracker = new EventTracker();

module.exports = tracker;
