/**
 * SERVER-EINBINDUNG — passend zu ranking.js v3.0
 * 
 * ranking.getRankedResults() Signatur (10 Parameter):
 *   1. query
 *   2. data            (DB-Rows)
 *   3. activeTab
 *   4. userLanguage
 *   5. votesMap
 *   6. intelligenceContext
 *   7. userInterests   → null wenn nicht implementiert
 *   8. urlQualitaetMap (Pogo-Tracking)
 *   9. trendMap        (Trend-Engine - Query-Volatilität)
 *  10. semanticScoreMap (KI-Embeddings Cosine-Similarity)
 */

const ranking        = require('./ranking/ranking');
const semanticAI     = require('./ranking/intelligence/semantic-intelligence');
const pogoTracking   = require('./ranking/user-journey');
const trendEngine    = require('./ranking/trend_engine');
const votesManager   = require('./modules/votes/votes-manager');
const luma_keywords  = require('./modules/keywords/luma-keywords');
const simhash        = require('./ranking/simhash');

// ── SERVER-START: Einmal initialisieren ──────────────────────────────────────
let urlQualitaetMap = new Map();
let trendMap = new Map();

async function initModules(pool) {
    // 1. KI-Embeddings laden
    semanticAI.initSemanticAI().catch(err =>
        console.error('[SemanticAI] Init-Fehler:', err)
    );

    // 2. Pogo-Qualitäts-Map (alle 6h aktualisieren)
    urlQualitaetMap = await pogoTracking.getUrlQualitaetMap(pool);
    setInterval(async () => {
        urlQualitaetMap = await pogoTracking.getUrlQualitaetMap(pool);
        console.log('[Pogo] urlQualitaetMap aktualisiert:', urlQualitaetMap.size, 'URLs');
    }, 6 * 60 * 60 * 1000);

    // 3. Trend-Map (alle 15 Min aktualisieren)
    async function trendMapAktualisieren() {
        try {
            await trendEngine.trendsScannen(pool);
            trendMap = await trendEngine.getTrendMap(pool);
            console.log('[Trends] trendMap aktualisiert:', trendMap.size, 'aktive Trends');
        } catch (err) {
            console.warn('[Trends] Fehler:', err.message);
        }
    }
    await trendMapAktualisieren(); // Beim Start einmal laden
    setInterval(trendMapAktualisieren, 15 * 60 * 1000); // Alle 15 Min
}

// ── SEARCH ENDPOINT ───────────────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
    const { q, tab = 'Alles', page = 1 } = req.query;
    if (!q || !q.trim()) return res.json({ results: [], total: 0 });

    const sessionId = req.session?.id || 'anonym';
    pogoTracking.rueckkehrErfassen(pool, { sessionId }).catch(() => {});

    // DB-Abfrage
    const dbResult = await pool.query(`
        SELECT * FROM pages
        WHERE to_tsvector('german', title || ' ' || content) @@ plainto_tsquery('german', $1)
        LIMIT 200
    `, [q]);
    const roheErgebnisse = dbResult.rows;
    const urls = roheErgebnisse.map(r => r.url);

    // Maps parallel laden
    const [votesMap, intelligenceContext] = await Promise.all([
        votesManager.getVotesMap(pool),
        luma_keywords.getContext(pool, q),
    ]);

    // KI-Semantic Scores (1× pro Query für alle URLs)
    let semanticScoreMap = new Map();

    if (semanticAI.isReady()) {
        try {
            const queryVector = await semanticAI.computeQueryEmbedding(q);
            semanticScoreMap = await semanticAI.getSemanticScores(pool, urls, queryVector);
        } catch (err) {
            console.warn('[SemanticAI] übersprungen:', err.message);
        }
    }

    // RANKING (11 Parameter in korrekter Reihenfolge)
    let ergebnisse = ranking.getRankedResults(
        q,                  // 1. Query
        roheErgebnisse,     // 2. DB-Rows
        tab,                // 3. activeTab
        'de',               // 4. userLanguage
        votesMap,           // 5. votesMap
        intelligenceContext,// 6. intelligenceContext
        null,               // 7. userInterests
        urlQualitaetMap,    // 8. urlQualitaetMap (Pogo-Tracking)
        trendMap,           // 9. trendMap (Trend-Engine)
        semanticScoreMap,   // 10. semanticScoreMap (KI-Embeddings)
        new Map()           // 11. paywallMap (Paywall-Status)
    );

    // Duplikat-Filter
    try {
        const hashMap = await simhash.getHashMap(pool, urls);
        const { results: mitFilter } = simhash.applyDuplicateFilter(ergebnisse, hashMap);
        ergebnisse = mitFilter.filter(r => !r.isDuplicate);
    } catch (err) {
        console.warn('[SimHash] übersprungen:', err.message);
    }

    // Impressionen erfassen
    pogoTracking.impressionenErfassen(pool,
        ergebnisse.slice(0, 10).map((e, idx) => ({
            url: e.url, position: idx + 1, suchanfrage: q
        }))
    ).catch(() => {});

    // Paginierung
    const proSeite = 10;
    const offset   = (parseInt(page) - 1) * proSeite;

    return res.json({
        results: ergebnisse.slice(offset, offset + proSeite),
        total:   ergebnisse.length,
        page:    parseInt(page),
    });
});

// ── KLICK-TRACKING ────────────────────────────────────────────────────────────
app.post('/api/klick', async (req, res) => {
    const { url, domain, position, suchanfrage } = req.body;
    const sessionId = req.session?.id || 'anonym';
    await pogoTracking.klickErfassen(pool, { url, domain, sessionId, position, suchanfrage });
    return res.json({ ok: true });
});

// ── CRON (täglich 03:00) ──────────────────────────────────────────────────────
// cron.schedule('0 3 * * *', async () => {
//     await pogoTracking.qualitaetNeuBerechnen(pool);
//     if (semanticAI.isReady()) {
//         await semanticAI.batchEmbedFehlende(pool, { limit: 500 });
//     }
// });