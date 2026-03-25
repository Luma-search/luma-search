/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LUMA ALGORITHMUS LOGGER - Zentrale Logging & Monitoring Zentrale
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Trackt den Status und die Aktivität ALLER 19 Algorithmus-Module
 * für Debugging und Performance-Analyse.
 *
 * MODULE (19 gesamt):
 * Hauptebene (11):
 *   1. ranking.js                    ✓ Haupt-Ranking-Engine
 *   2. quality-metrics.js            ✓ Phrase-Matching & Scoring
 *   3. simhash.js                    ✓ Duplikat-Erkennung
 *   4. pogo-tracking.js              ✓ CTR-Normalisierung
 *   5. spam-filter.js                ✓ Spam-Detektion
 *   6. trust-score.js                ✓ Vertrauens-Berechnung
 *   7. domain-diversity.js           ✓ Domain-Vielfalt
 *   8. reciprocal-trust.js           ✓ Backlink-Trust-Flow
 *   9. user-account-trust.js         ✗ Nutzer-Vertrauen
 *   10. user-journey.js              ✗ Nutzer-Pfad-Analyse
 *   11. trend_engine.js              ✗ Trend-Erkennung
 *
 * ads/ (2):
 *   12. ad-density-malus.js          ✗ Ad-Dichte-Malus
 *   13. source-reliability.js        ✗ Quellen-Zuverlässigkeit
 *
 * intelligence/ (4):
 *   14. dynamic-weights.js           ✗ Dynamische Gewichte
 *   15. intent-engine.js             ✗ Intent-Erkennung
 *   16. keyword-boost.js             ✗ Keyword-Boost
 *   17. semantic-engine.js           ✗ Semantik-Engine
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 */

'use strict';

// ─── Logging Statistiken ──────────────────────────────────────────────────────

const stats = {
    module_calls: {},           // { moduleName: callCount }
    module_timing: {},          // { moduleName: totalTimeMs }
    phase_results: {},          // { phaseName: { input, output, duration } }
    errors: [],                 // { module, error, timestamp }
    search_count: 0,            // Gesamt-Suche seit Server-Start
    ranking_count: 0,           // Gesamt-Rankings
};

// ─── Module tracken ────────────────────────────────────────────────────────────

const MODULE_LIST = [
    // Hauptebene
    { name: 'ranking.js',            category: 'Core',         status: '✓' },
    { name: 'quality-metrics.js',    category: 'Scoring',      status: '✓' },
    { name: 'simhash.js',            category: 'Deduplication', status: '✓' },
    { name: 'pogo-tracking.js',      category: 'Signals',      status: '✓' },
    { name: 'spam-filter.js',        category: 'Filtering',    status: '✓' },
    { name: 'trust-score.js',        category: 'Trust',        status: '✓' },
    { name: 'domain-diversity.js',   category: 'SERP-Quality', status: '✓' },
    { name: 'reciprocal-trust.js',   category: 'Backlinks',    status: '✓' },
    { name: 'user-account-trust.js', category: 'User-Trust',   status: '#' },
    { name: 'user-journey.js',       category: 'Behavior',     status: '#' },
    { name: 'trend_engine.js',       category: 'Trending',     status: '#' },
    
    // ads/
    { name: 'ad-density-malus.js',   category: 'Ads',         status: '#' },
    { name: 'source-reliability.js', category: 'Ads',         status: '#' },
    
    // intelligence/
    { name: 'dynamic-weights.js',    category: 'Intelligence',  status: '#' },
    { name: 'intent-engine.js',      category: 'Intelligence',  status: '#' },
    { name: 'keyword-boost.js',      category: 'Intelligence',  status: '#' },
    { name: 'semantic-engine.js',    category: 'Intelligence',  status: '#' },
];

// ─── Funkcionen ─────────────────────────────────────────────────────────────────

/**
 * Log einen Funktions-Aufruf eines Modules
 * @param {string} moduleName - z.B. "quality-metrics"
 * @param {string} functionName - z.B. "calculateRelevanceScore"
 * @param {object} params - Input-Parameter
 * @param {*} result - Rückgabewert
 * @param {number} durationMs - Ausführungszeit in Millisekunden
 */
function logModuleCall(moduleName, functionName, params, result, durationMs = 0) {
    if (!stats.module_calls[moduleName]) {
        stats.module_calls[moduleName] = 0;
        stats.module_timing[moduleName] = 0;
    }
    
    stats.module_calls[moduleName]++;
    stats.module_timing[moduleName] += durationMs;
    
    const debug = process.env.DEBUG_ALGORITHM_LOGGER === 'true';
    if (debug) {
        console.log(`[AlgorithmusLogger] ${moduleName}.${functionName}() | ${durationMs}ms | Calls: ${stats.module_calls[moduleName]}`);
    }
}

/**
 * Log eine Ranking Phase mit Input/Output
 * @param {string} phaseName - z.B. "SPAM_FILTER", "RELEVANCE", "DIVERSITY"
 * @param {number} inputCount - Anzahl Input-Items
 * @param {number} outputCount - Anzahl Output-Items
 * @param {number} durationMs - Dauer in ms
 * @param {object} details - Zusätzliche Details (z.B. { blocked: 15 })
 */
function logRankingPhase(phaseName, inputCount, outputCount, durationMs, details = {}) {
    stats.phase_results[phaseName] = {
        input: inputCount,
        output: outputCount,
        blocked: inputCount - outputCount,
        duration: durationMs,
        details: details,
        timestamp: new Date()
    };
    
    const debug = process.env.DEBUG_RANKING_PHASES === 'true';
    if (debug) {
        console.log(`[Phase] ${phaseName} | Input: ${inputCount} → Output: ${outputCount} | Blocked: ${inputCount - outputCount} | ${durationMs}ms`);
    }
}

/**
 * Log einen Fehler aus einem Module
 * @param {string} moduleName 
 * @param {string} functionName 
 * @param {Error} error 
 */
function logError(moduleName, functionName, error) {
    stats.errors.push({
        module: moduleName,
        function: functionName,
        error: error.message,
        timestamp: new Date(),
        stack: error.stack
    });
    
    console.error(`[AlgorithmusLogger] ❌ ${moduleName}.${functionName}() ERROR: ${error.message}`);
}

/**
 * Gibt eine Übersicht aller Module + Statistiken aus
 */
function printModuleStatus() {
    console.log('\n' + '═'.repeat(90));
    console.log('🧬 ALGORITHMUS-MODULE STATUS BERICHT');
    console.log('═'.repeat(90));
    
    // Gruppiert nach Kategorie
    const byCategory = {};
    MODULE_LIST.forEach(mod => {
        if (!byCategory[mod.category]) byCategory[mod.category] = [];
        byCategory[mod.category].push(mod);
    });
    
    for (const [category, modules] of Object.entries(byCategory)) {
        console.log(`\n📦 ${category}`);
        modules.forEach(mod => {
            const calls = stats.module_calls[mod.name] || 0;
            const timing = stats.module_timing[mod.name] || 0;
            const status = mod.status === '✓' ? '✅' : mod.status === '#' ? '⚙️' : '❌';
            const avgMs = calls > 0 ? (timing / calls).toFixed(1) : '0.0';
            
            console.log(`   ${status} ${mod.name.padEnd(30)} | Calls: ${calls.toString().padStart(5)} | Avg: ${avgMs}ms`);
        });
    }
    
    console.log('\n' + '═'.repeat(90));
    console.log(`📊 GESAMTSTATISTIKEN`);
    console.log('═'.repeat(90));
    
    const totalCalls = Object.values(stats.module_calls).reduce((a, b) => a + b, 0);
    const totalTime = Object.values(stats.module_timing).reduce((a, b) => a + b, 0);
    
    console.log(`   Gesamt Module geladen:    ${MODULE_LIST.length}`);
    console.log(`   Aktive Module:            ${Object.keys(stats.module_calls).length}`);
    console.log(`   Gesamt Funktions-Aufrufe: ${totalCalls}`);
    console.log(`   Gesamt Ausführungszeit:   ${totalTime}ms`);
    console.log(`   Durchschn. pro Aufruf:    ${totalCalls > 0 ? (totalTime / totalCalls).toFixed(2) : '0'}ms`);
    console.log(`   Search-Requests:          ${stats.search_count}`);
    console.log(`   Ranking-Operationen:      ${stats.ranking_count}`);
    
    if (stats.errors.length > 0) {
        console.log(`   ❌ Fehler:                 ${stats.errors.length}`);
        stats.errors.slice(-5).forEach(err => {
            console.log(`      • ${err.module}.${err.function} - ${err.error}`);
        });
    }
    
    console.log('═'.repeat(90) + '\n');
}

/**
 * Detaillierter Ranking-Report nach jeder Suche
 */
function printRankingReport(query) {
    console.log('\n' + '╔' + '═'.repeat(88) + '╗');
    console.log(`║ 📈 RANKING REPORT FÜR: "${query}"`);
    console.log('╚' + '═'.repeat(88) + '╝\n');
    
    for (const [phase, result] of Object.entries(stats.phase_results)) {
        const filtered = result.input - result.output;
        const filterRate = result.input > 0 ? ((filtered / result.input) * 100).toFixed(1) : 0;
        console.log(`   ${phase.padEnd(25)} | ${result.input} → ${result.output} | Filtered: ${filtered} (${filterRate}%) | ${result.duration}ms`);
        
        if (Object.keys(result.details).length > 0) {
            console.log(`   ${''.padEnd(25)} | Details: ${JSON.stringify(result.details)}`);
        }
    }
    
    console.log('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    logModuleCall,
    logRankingPhase,
    logError,
    printModuleStatus,
    printRankingReport,
    
    // Stats Zugriff
    getStats: () => stats,
    incrementSearchCount: () => { stats.search_count++; },
    incrementRankingCount: () => { stats.ranking_count++; },
    resetStats: () => {
        stats.module_calls = {};
        stats.module_timing = {};
        stats.phase_results = {};
        stats.errors = [];
    },
    
    MODULE_LIST,
};
