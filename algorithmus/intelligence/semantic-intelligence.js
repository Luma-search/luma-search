'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LUMA – SEMANTISCHE KI-SUCHE (semantic-intelligence.js)
 *
 * ─── WARUM DIESER ANSATZ UND NICHT DER NAIVE? ────────────────────────────────
 *
 *  ❌ FALSCHER ANSATZ (was die meisten zuerst bauen):
 *     Für jede Suche → Embedding für jeden Kandidaten berechnen
 *     500 Kandidaten × 150ms = 75 Sekunden Wartezeit → unbrauchbar
 *
 *  ✅ RICHTIGER ANSATZ (wie Google, Bing, alle echten Suchmaschinen):
 *     CRAWLER (einmalig, Hintergrund):
 *       Seite gecrawlt → Embedding berechnen → in luma_embeddings speichern
 *
 *     SUCHE (Echtzeit, ~25ms):
 *       1. Query-Embedding berechnen (1× pro Suche, ~150ms, gecacht)
 *       2. Gespeicherte Vektoren aus DB laden (für die ~20 Kandidaten die schon
 *          durch Spam-Filter + Trust-Filter + Keyword-Filter kamen)
 *       3. Cosine-Similarity berechnen → sig.semantic in ranking.js setzen
 *
 * ─── WAS DAS MODELL KANN ─────────────────────────────────────────────────────
 *
 *  Suche: "günstige unterkunft münchen"
 *  Findet auch: "preiswerte Hotels in der bayerischen Landeshauptstadt" ✓
 *               "budget accommodation Bavaria" ✓
 *               (ohne dass diese Wörter in der Suchanfrage stehen!)
 *
 *  Das ist echter semantischer Vergleich — kein Synonym-Wörterbuch.
 *
 * ─── MODELL ──────────────────────────────────────────────────────────────────
 *
 *  Xenova/paraphrase-multilingual-MiniLM-L12-v2
 *  → 50MB, versteht Deutsch + Englisch + 50 weitere Sprachen
 *  → 384-dimensionaler Vektor pro Text
 *  → Läuft lokal (kein API-Key, kein Cloud-Dienst, keine Kosten)
 *
 *  Alternative für reines Deutsch:
 *  Xenova/distiluse-base-multilingual-cased-v1 (420MB, etwas besser)
 *
 * ─── TABELLEN (aus migration_semantic.sql) ───────────────────────────────────
 *
 *  public.luma_embeddings
 *    url         TEXT PRIMARY KEY
 *    domain      TEXT
 *    embedding   TEXT     (JSON-Array mit 384 Floats, z.B. "[0.12, -0.04, ...]")
 *    text_hash   TEXT     (SHA1 des Textes → Änderungserkennung)
 *    gecrawlt_am TIMESTAMP
 *
 * ─── EINSTIEGSPUNKTE ─────────────────────────────────────────────────────────
 *
 *  Server-Start:        initSemanticAI()
 *  Crawler (je Seite):  embedDocumentAndSave()
 *  Suche (je Query):    computeQueryEmbedding()  ← gecacht
 *  Ranking (Phase 2):   getSemanticScores()      ← lädt aus DB, vergleicht alles
 *  In ranking.js:       sig.semantic = semanticScores.get(item.url) ?? 0.5
 * ═══════════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

// ─── Validiere erforderliche Umgebungsvariablen ───────────────────────────────
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        throw new Error(`❌ Erforderliche Umgebungsvariable fehlt: ${envVar} (bitte .env Datei prüfen)`);
    }
}

// ─── PostgreSQL Pool (wie in crawler_new/db.js) ──────────────────────────────
const dbPool = new Pool({
    user:     process.env.DB_USER,
    host:     process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port:     parseInt(process.env.DB_PORT),
});

// ─── Konfiguration ────────────────────────────────────────────────────────────

const KONFIG = {
    // Mehrsprachiges Modell (Deutsch + Englisch, 50MB, schnell)
    // Wird beim ersten Start automatisch heruntergeladen und gecacht.
    MODEL_NAME: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',

    // Ähnlichkeit ab der ein semantischer Bonus vergeben wird
    // 1.0 = identisch, 0.0 = komplett verschieden
    // 0.65 = sehr ähnliche Bedeutung, auch bei anderen Wörtern
    MIN_AEHNLICHKEIT: 0.65,

    // Query-Embedding wird gecacht (dieselbe Suche innerhalb von 10 Min kostet 0ms)
    CACHE_TTL_MS: 10 * 60 * 1000,

    // Maximale Zeichenlänge des Textes der eingebettet wird
    // Longer = genauer, aber langsamer. 512 Tokens ≈ 400 Wörter.
    MAX_TEXT_LAENGE: 512,

    // Wie viele Zeichen aus Titel vs. Content nehmen
    TITEL_ZEICHEN:   120,
    CONTENT_ZEICHEN: 392,
};

// ─── Modul-State ──────────────────────────────────────────────────────────────

let pipeline_fn  = null;   // @xenova/transformers pipeline
let istBereit    = false;
let isLaden      = false;

// Query-Embedding Cache: Map<query_string, { vektor, erstellt_ms }>
const queryCache = new Map();

// ─── Initialisierung ──────────────────────────────────────────────────────────

/**
 * Lädt das KI-Modell. Beim ersten Aufruf ~2-5 Sekunden (Download + Init).
 * Danach sofort bereit.
 *
 * Aufrufen beim Server-Start, NICHT beim ersten Request.
 *
 * Aufruf in server.js:
 *   const semanticAI = require('./semantic-intelligence');
 *   semanticAI.initSemanticAI().catch(err => console.error('[SemanticAI]', err));
 */
async function initSemanticAI() {
    if (istBereit || isLaden) return;
    isLaden = true;

    try {
        console.log(`[SemanticAI] Lade Modell: ${KONFIG.MODEL_NAME}`);
        console.log('[SemanticAI] (Erststart: ~2-5 Sek Download + Init, danach sofort)');

        // @xenova/transformers dynamisch laden (CommonJS-kompatibel)
        const { pipeline } = await import('@xenova/transformers');
        pipeline_fn = await pipeline('feature-extraction', KONFIG.MODEL_NAME);

        istBereit = true;
        isLaden   = false;
        console.log('[SemanticAI] ✅ Modell bereit — Semantische Suche aktiv');

    } catch (fehler) {
        isLaden = false;
        console.error('[SemanticAI] ❌ Modell konnte nicht geladen werden:', fehler.message);
        console.error('[SemanticAI] → Tipp: npm install @xenova/transformers');
        console.error('[SemanticAI] → Suche läuft ohne Semantik weiter (kein Absturz)');
    }
}

// ─── Embedding berechnen ──────────────────────────────────────────────────────

/**
 * Wandelt einen Text in einen 384-dimensionalen Vektor um.
 * Interne Hilfsfunktion — wird von computeQueryEmbedding() und
 * embedDocumentAndSave() genutzt.
 *
 * @param {string} text
 * @returns {Promise<number[]|null>} 384-dimensionaler Float-Array oder null bei Fehler
 */
async function _textZuVektor(text) {
    if (!istBereit || !pipeline_fn) return null;
    if (!text || text.trim().length < 3) return null;

    try {
        const begrenzt = text.slice(0, KONFIG.MAX_TEXT_LAENGE).trim();
        const output   = await pipeline_fn(begrenzt, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    } catch (fehler) {
        console.error('[SemanticAI] Embedding-Fehler:', fehler.message);
        return null;
    }
}

// ─── Query-Embedding (gecacht) ────────────────────────────────────────────────

/**
 * Berechnet das Embedding für eine Suchanfrage.
 * Wird gecacht: Dieselbe Query kostet innerhalb von 10 Min 0ms.
 *
 * Aufruf in server.js VOR dem Ranking:
 *   const queryVektor = await semanticAI.computeQueryEmbedding(query);
 *   // queryVektor dann an getSemanticScores() übergeben
 *
 * @param {string} query - Die Suchanfrage
 * @returns {Promise<number[]|null>}
 */
async function computeQueryEmbedding(query) {
    if (!istBereit) return null;

    const key = query.toLowerCase().trim();

    // Cache prüfen
    const gecacht = queryCache.get(key);
    if (gecacht && Date.now() - gecacht.erstellt_ms < KONFIG.CACHE_TTL_MS) {
        return gecacht.vektor;
    }

    const vektor = await _textZuVektor(key);
    if (vektor) {
        queryCache.set(key, { vektor, erstellt_ms: Date.now() });

        // Cache aufräumen: Nie mehr als 500 Einträge
        if (queryCache.size > 500) {
            const aeltesterKey = queryCache.keys().next().value;
            queryCache.delete(aeltesterKey);
        }
    }

    return vektor;
}

// ─── Semantische Ähnlichkeits-Scores für Ranking ──────────────────────────────

/**
 * Lädt die gespeicherten Embeddings für eine Liste von URLs aus der DB
 * und berechnet die Cosine-Similarity gegen den Query-Vektor.
 *
 * Wird in server.js aufgerufen, BEVOR ranking.js aufgerufen wird.
 * Das Ergebnis wird als Map an getRankedResults() übergeben.
 *
 * Aufruf in server.js:
 *   const queryVektor      = await semanticAI.computeQueryEmbedding(query);
 *   const semanticScoreMap = await semanticAI.getSemanticScores(dbPool, urls, queryVektor);
 *   // In ranking.js Phase 3: sig.semantic = semanticScoreMap.get(item.url) ?? 0.5
 *
 * @param {object}   dbPool
 * @param {string[]} urls        - URLs aller Ranking-Kandidaten
 * @param {number[]} queryVektor - Embedding der Suchanfrage
 * @returns {Promise<Map<string, number>>} Map<url, normalisierter Score 0.0–1.0>
 */
async function getSemanticScores(dbPool, urls, queryVektor) {
    const scoreMap = new Map();
    if (!istBereit || !queryVektor || !urls || urls.length === 0) return scoreMap;

    try {
        // Alle Embeddings für die Kandidaten-URLs in einem Query laden
        const { rows } = await dbPool.query(`
            SELECT url, embedding
            FROM public.luma_embeddings
            WHERE url = ANY($1::text[])
              AND embedding IS NOT NULL
        `, [urls]);

        for (const row of rows) {
            try {
                const docVektor = JSON.parse(row.embedding);
                if (!Array.isArray(docVektor) || docVektor.length !== queryVektor.length) continue;

                const aehnlichkeit = _cosineSimilarity(queryVektor, docVektor);

                // Normalisieren: MIN_AEHNLICHKEIT→1.0 auf 0.0→1.0
                // Unter MIN_AEHNLICHKEIT: neutral (0.5, kein Malus)
                let normalisiertScore;
                if (aehnlichkeit >= KONFIG.MIN_AEHNLICHKEIT) {
                    normalisiertScore = (aehnlichkeit - KONFIG.MIN_AEHNLICHKEIT) / (1 - KONFIG.MIN_AEHNLICHKEIT);
                } else {
                    // Sanfter Abfall: Je unähnlicher, desto näher an 0.0
                    // Aber nie unter 0.1 (kein harter Malus für fehlendes Embedding)
                    normalisiertScore = Math.max(0.1, aehnlichkeit / KONFIG.MIN_AEHNLICHKEIT * 0.5);
                }

                scoreMap.set(row.url, Math.min(1, Math.max(0, normalisiertScore)));

            } catch {
                // Ungültiges JSON → überspringen
            }
        }

        const gefunden = scoreMap.size;
        const fehlen   = urls.length - gefunden;
        if (gefunden > 0) {
            console.log(`[SemanticAI] ${gefunden}/${urls.length} URLs mit Embedding | ${fehlen} ohne (→ 0.5 neutral)`);
        }

    } catch (fehler) {
        console.error('[SemanticAI] Fehler beim Laden der Embeddings:', fehler.message);
    }

    return scoreMap;
}

// ─── Cosine-Similarity ────────────────────────────────────────────────────────

/**
 * Berechnet die Cosine-Ähnlichkeit zwischen zwei Vektoren.
 * Da die Vektoren normalisiert sind (Länge = 1), ist das einfach das Dot-Product.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} -1.0 bis 1.0 (bei normalisierten Vektoren: 0.0 bis 1.0)
 */
function _cosineSimilarity(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

// ─── Crawler-Funktion: Embedding berechnen und speichern ─────────────────────

/**
 * Berechnet das Embedding für eine gecrawlte Seite und speichert es in der DB.
 * Wird im CRAWLER aufgerufen, nicht im Such-Server.
 *
 * Berechnet nur neu wenn sich der Inhalt seit dem letzten Crawl geändert hat
 * (verglichen per SHA1-Hash).
 *
 * Aufruf im Crawler:
 *   await semanticAI.embedDocumentAndSave(dbPool, {
 *       url, domain, title, content
 *   });
 *
 * @param {object} dbPool
 * @param {object} dokument
 *   @param {string} dokument.url
 *   @param {string} dokument.domain
 *   @param {string} dokument.title
 *   @param {string} dokument.content
 * @returns {Promise<boolean>} true wenn Embedding gespeichert/aktualisiert wurde
 */
async function embedDocumentAndSave(dbPool, { url, domain, title, content }) {
    if (!istBereit) {
        console.error(`[SemanticAI] ❌ Modell nicht bereit für: ${url}`);
        return false;
    }

    try {
        console.log(`[SemanticAI] ⏳ Embedding wird berechnet: ${url.substring(0, 60)}...`);
        
        // Text für Embedding zusammenbauen: Titel ist wichtiger → öfter
        const einzubettenderText = [
            (title   || '').slice(0, KONFIG.TITEL_ZEICHEN),
            (title   || '').slice(0, KONFIG.TITEL_ZEICHEN), // Titel doppelt → höheres Gewicht
            (content || '').slice(0, KONFIG.CONTENT_ZEICHEN),
        ].join(' ').trim();

        if (einzubettenderText.length < 20) {
            console.log(`[SemanticAI] ℹ️  Zu kurzer Text (${einzubettenderText.length}z) — übersprungen`);
            return false;
        }

        // Hash berechnen → nur neu einbetten wenn sich Inhalt geändert hat
        const textHash = crypto.createHash('sha1').update(einzubettenderText).digest('hex');

        // Prüfen ob bereits ein aktuelles Embedding vorhanden ist
        const { rows: existing } = await dbPool.query(`
            SELECT text_hash FROM public.luma_embeddings WHERE url = $1
        `, [url]);

        if (existing.length > 0 && existing[0].text_hash === textHash) {
            console.log(`[SemanticAI] ℹ️  Text unverändert — Re-Embedding übersprungen`);
            return false; // Inhalt unverändert → kein Re-Embedding nötig
        }

        // Embedding berechnen
        const vektor = await _textZuVektor(einzubettenderText);
        if (!vektor) {
            console.error(`[SemanticAI] ❌ Embedding-Berechnung fehlgeschlagen für: ${url}`);
            return false;
        }
        
        console.log(`[SemanticAI] ✅ Vektor berechnet (${vektor.length} dim): ${url.substring(0, 50)}...`);

        // In DB speichern
        try {
            const result = await dbPool.query(`
                INSERT INTO public.luma_embeddings
                    (url, domain, embedding, text_hash, gecrawlt_am)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (url) DO UPDATE SET
                    domain      = $2,
                    embedding   = $3,
                    text_hash   = $4,
                    gecrawlt_am = NOW()
            `, [url, domain || '', JSON.stringify(vektor), textHash]);
            
            console.log(`[SemanticAI] ✅ Embedding GESPEICHERT: ${url.substring(0, 50)}...`);
            return true;
            
        } catch (dbErr) {
            console.error(`[SemanticAI] ❌ DB-INSERT fehlgeschlagen:`);
            console.error(`[SemanticAI]    URL: ${url}`);
            console.error(`[SemanticAI]    Fehler: ${dbErr.message}`);
            console.error(`[SemanticAI]    Code: ${dbErr.code}`);
            return false;
        }

    } catch (fehler) {
        console.error(`[SemanticAI] ❌ UNBEKANNTER FEHLER: ${fehler.message}`);
        console.error(`[SemanticAI]    Stack: ${fehler.stack}`);
        return false;
    }
}

// ─── Batch-Embedding für bereits vorhandene Seiten ───────────────────────────

/**
 * Berechnet Embeddings für alle Seiten die noch keines haben.
 * Nützlich für den ersten Start nach Installation.
 *
 * Läuft als täglicher Hintergrund-Job oder einmalig manuell.
 *
 * Aufruf in cron.js:
 *   await semanticAI.batchEmbedFehlende(dbPool, { limit: 500 });
 *
 * @param {object} dbPool
 * @param {object} [opts]
 *   @param {number} [opts.limit=200]   - Wie viele pro Durchlauf
 *   @param {number} [opts.pauseMs=50]  - Pause zwischen Embeddings (Throttling)
 * @returns {Promise<{ verarbeitet, gespeichert, fehler }>}
 */
async function batchEmbedFehlende(dbPool, { limit = 200, pauseMs = 50 } = {}) {
    if (!istBereit) {
        console.log('[SemanticAI] Modell nicht bereit — Batch übersprungen');
        return { verarbeitet: 0, gespeichert: 0, fehler: 0 };
    }

    console.log(`[SemanticAI] Starte Batch-Embedding (max. ${limit} Seiten)...`);
    const start = Date.now();

    // Seiten aus luma_haupt_index die noch kein Embedding haben
    // (LEFT JOIN auf luma_embeddings → NULL = noch nicht eingebettet)
    const { rows: seiten } = await dbPool.query(`
        SELECT 
            h.url, 
            h.titel as title,
            h.inhalt_text as content
        FROM public.luma_haupt_index h
        LEFT JOIN public.luma_embeddings e ON e.url = h.url
        WHERE e.url IS NULL
          AND LENGTH(COALESCE(h.titel, '') || COALESCE(h.inhalt_text, '')) > 50
        ORDER BY h.gecrawlt_am DESC
        LIMIT $1
    `, [limit]);

    let verarbeitet = 0;
    let gespeichert = 0;
    let fehler      = 0;

    for (const seite of seiten) {
        verarbeitet++;
        
        // Domain aus URL extrahieren
        try {
            const urlObj = new URL(seite.url);
            const domain = urlObj.hostname.replace('www.', '');
            
            const ok = await embedDocumentAndSave(dbPool, {
                url: seite.url,
                domain,
                title: seite.title || '',
                content: seite.content || ''
            });
            
            if (ok) gespeichert++;
            else    fehler++;
        } catch (parseErr) {
            console.error('[SemanticAI] URL-Parse-Fehler:', seite.url);
            fehler++;
        }

        // Kurze Pause damit der Server nicht überlastet wird
        if (pauseMs > 0) {
            await new Promise(r => setTimeout(r, pauseMs));
        }
    }

    const dauer = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[SemanticAI] Batch fertig in ${dauer}s | ${gespeichert} gespeichert | ${fehler} Fehler`);

    return { verarbeitet, gespeichert, fehler };
}

// ─── Hilfsfunktion: Ist die KI bereit? ───────────────────────────────────────

function isReady() { return istBereit; }

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Server-Start
    initSemanticAI,

    // Vor jedem Ranking-Aufruf (in server.js Such-Route)
    computeQueryEmbedding,
    getSemanticScores,

    // Im Crawler
    embedDocumentAndSave,

    // Täglicher Cron-Job
    batchEmbedFehlende,

    // Status
    isReady,

    // Konfiguration
    KONFIG,
};