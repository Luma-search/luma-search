/**
 * AI-basierte Semantische Moderation
 * Nutzt Embeddings um Sätze mit Kontext zu verstehen
 * 
 * Statt "umbringen" zu blocken, versteht das System:
 * - "ich sterbe vor Lachen" = OK ✓
 * - "ich werde dich töten" = NICHT OK ✗
 */

const { pool } = require('../../crawler_new/db.js');

let moderationPatternsCache = [];
let embeddingModel = null;
let cacheTime = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 Min

// **WICHTIG**: Das KI-Modell wird LAZY-LOADED nur wenn nötig
async function initEmbeddingModel() {
    if (embeddingModel) return embeddingModel;
    
    try {
        console.log('🤖 Lade Embedding-Modell...');
        const { pipeline } = await import('@xenova/transformers');
        embeddingModel = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
        console.log('✅ Embedding-Modell bereit');
        return embeddingModel;
    } catch (err) {
        console.error('❌ Fehler beim Laden des Models:', err.message);
        console.log('⚠️  Fallback auf Wort-basierte Moderation...');
        return null;
    }
}

/**
 * Cosine-Similarity zwischen zwei Vektoren berechnen (0-1)
 */
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0) {
        return 0;
    }

    // Normalisierung
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
}

/**
 * Moderation-Patterns aus Cache laden (mit Auto-Refresh)
 */
async function getModerationPatterns() {
    const now = Date.now();
    
    if (moderationPatternsCache.length === 0 || now - cacheTime > CACHE_DURATION) {
        try {
            // Liest aus gemeinschafts_blackliste — die einzige, zusammengeführte Tabelle.
            // Nur Einträge vom Typ 'phrase' (kein Regex) eignen sich für Embedding-Vergleiche.
            const result = await pool.query(`
                SELECT id, pattern AS satz, kategorie, aktion, prioritaet,
                       beschreibung AS grund
                FROM gemeinschafts_blackliste
                WHERE ist_aktiv  = TRUE
                  AND typ        = 'phrase'
                ORDER BY prioritaet DESC
            `);
            moderationPatternsCache = result.rows;
            cacheTime = now;
            console.log(`🔄 Moderation-Cache aktualisiert (${moderationPatternsCache.length} Muster)`);
        } catch (err) {
            console.error('❌ Fehler beim Laden der Patterns:', err.message);
            return moderationPatternsCache;
        }
    }
    
    return moderationPatternsCache;
}

/**
 * Text in Embedding konvertieren
 */
async function getEmbedding(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    const model = await initEmbeddingModel();
    if (!model) return null;

    try {
        const normalized = text.toLowerCase().trim();
        const output = await model(normalized, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    } catch (err) {
        console.error('❌ Embedding-Fehler:', err.message);
        return null;
    }
}

/**
 * Hauptfunktion: Text gegen AI-Moderation prüfen
 * Gibt { blocked: bool, geflaggt: bool, grund: string, kategorie: string, score: number }
 */
async function checkAIModeration(text, client_ip = 'unknown') {
    if (!text || typeof text !== 'string' || text.length < 5) {
        return { blocked: false, geflaggt: false };
    }

    const patterns = await getModerationPatterns();
    if (patterns.length === 0) {
        return { blocked: false, geflaggt: false };
    }

    // TEXT-EMBEDDING erstellen
    const inputEmbedding = await getEmbedding(text);
    if (!inputEmbedding) {
        console.log('⚠️  Konnte Embedding nicht erstellen, nutze Fallback');
        return { blocked: false, geflaggt: false };
    }

    // Gegen alle Patterns vergleichen
    let bestMatch = null;
    let bestScore = 0;

    for (const pattern of patterns) {
        // Einfacher Text-Check (schnell)
        const normalizedText = text.toLowerCase();
        const normalizedPattern = pattern.satz.toLowerCase();
        
        // Wenn Pattern genau drin ist, sofort 1.0 Ähnlichkeit
        if (normalizedText.includes(normalizedPattern)) {
            bestMatch = pattern;
            bestScore = 1.0;
            break;
        }

        // Sonst: Embedding-Ähnlichkeit berechnen
        try {
            const patternEmbedding = await getEmbedding(pattern.satz);
            if (!patternEmbedding) continue;

            const similarity = cosineSimilarity(inputEmbedding, patternEmbedding);

            // Schwellenwert fest 0.82 — Priorität senkt ihn NICHT mehr.
            // Früher: 0.65 - (prioritaet/1000) → bei prioritaet=100 nur noch 0.55 → zu viele False Positives.
            // Jetzt: Priorität bestimmt nur noch welches Pattern bei Gleichstand gewinnt, nicht den Threshold.
            const adjustedThreshold = 0.82;
            if (similarity > adjustedThreshold && similarity > bestScore) {
                bestMatch = pattern;
                bestScore = similarity;
            }
        } catch (err) {
            console.warn(`⚠️  Fehler beim Vergleich "${pattern.satz}":`, err.message);
        }
    }

    // ERGEBNIS — Schwellenwert fest 0.82, Priorität senkt ihn nicht mehr
    const finalThreshold = 0.82;
    if (bestMatch && bestScore > finalThreshold) {
        console.log(`🚫 [AI-MOD] Match: "${bestMatch.satz}" (Score: ${bestScore.toFixed(3)}) - Aktion: ${bestMatch.aktion}`);
        
        // flag wird wie block behandelt — beide Aktionen blockieren die Nachricht
        const istBlockiert = bestMatch.aktion === 'block' || bestMatch.aktion === 'flag';

        return {
            blocked:  istBlockiert,
            geflaggt: bestMatch.aktion === 'flag',
            grund:    bestMatch.grund,
            kategorie: bestMatch.kategorie,
            muster:   bestMatch.satz,
            score:    bestScore,
            prioritaet: bestMatch.prioritaet
        };
    }

    return { blocked: false, geflaggt: false };
}

/**
 * Admin-Funktion: Neues Muster hinzufügen
 */
async function addModerationPattern(satz, kategorie, grund, aktion, prioritaet, admin_user) {
    try {
        await pool.query(`
            INSERT INTO gemeinschafts_blackliste
                (pattern, typ, kategorie, aktion, prioritaet, beschreibung, erstellt_von)
            VALUES ($1, 'phrase', $2, $3, $4, $5, $6)
            ON CONFLICT (pattern) DO NOTHING
        `, [satz, kategorie, aktion, prioritaet, grund, admin_user]);

        moderationPatternsCache = [];
        console.log(`✅ Muster hinzugefügt: "${satz}"`);
        
        return { success: true };
    } catch (err) {
        console.error('❌ Fehler beim Hinzufügen des Musters:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Admin-Funktion: Muster entfernen
 */
async function removeModerationPattern(id, admin_user) {
    try {
        const result = await pool.query(`
            UPDATE gemeinschafts_blackliste
            SET ist_aktiv    = FALSE,
                loeschgruende = 'Deaktiviert durch: ' || $2
            WHERE id = $1
        `, [id, admin_user]);

        if (result.rowCount === 0) {
            return { success: false, fehler: 'Muster nicht gefunden' };
        }

        moderationPatternsCache = [];
        console.log(`✅ Muster #${id} deaktiviert`);
        
        return { success: true };
    } catch (err) {
        console.error('❌ Fehler beim Entfernen des Musters:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Audit-Trail: Speichere Moderation-Verdict
 */
async function logModerationVerdict(beitrag_typ, beitrag_id, text, erkanntes_muster, score, aktion, kategorie, nutzer_ip, geblocked, geflaggt) {
    try {
        const result = await pool.query(`
            INSERT INTO gemeinschafts_moderation_verdicts 
            (beitrag_typ, beitrag_id, text, erkennte_muster, ahnlichkeit_score, aktion, kategorie, nutzer_ip, geblocked, geflagged)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [beitrag_typ, beitrag_id, text, erkanntes_muster, score, aktion, kategorie, nutzer_ip, geblocked, geflaggt]);
        
        console.log(`📝 [VERDICT LOG] ${beitrag_typ}#${beitrag_id} - ${aktion} - ${kategorie}`);
    } catch (err) {
        console.error('❌ [VERDICT LOG ERROR]:', err.message);
        console.error('   Query-Params:', { beitrag_typ, beitrag_id, text: text?.substring(0, 50), aktion, kategorie });
    }
}

module.exports = {
    checkAIModeration,
    addModerationPattern,
    removeModerationPattern,
    getModerationPatterns,
    logModerationVerdict,
    initEmbeddingModel
};