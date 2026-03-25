/**
 * Semantische Content-Moderation
 * Nutzt KI-Embeddings um Kontext statt nur Wörter zu verstehen
 * 
 * Vorteile:
 * - "ich sterbe vor Lachen" → OK
 * - "ich werde dich töten" → Blockiert
 * - Ganze Sätze speichern, nicht einzelne Wörter
 * - Admins fügen problematische Sätze hinzu
 */

const { pipeline, env } = require('@xenova/transformers');
const { pool } = require('../crawler_new/db.js');

// Embedding cache für Performance
let embeddingCache = new Map();
let extractor = null;

/**
 * Lade das Embedding-Modell (wird von SemanticAI bereits geladen)
 */
async function getEmbeddingExtractor() {
    if (!extractor) {
        try {
            extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2');
            console.log('✅ Semantic Moderation Extractor geladen');
        } catch (err) {
            console.error('❌ Fehler beim Laden des ML-Modells:', err.message);
            return null;
        }
    }
    return extractor;
}

/**
 * Generiere Embedding für einen Text
 */
async function getEmbedding(text) {
    // Cache check
    if (embeddingCache.has(text)) {
        return embeddingCache.get(text);
    }

    const model = await getEmbeddingExtractor();
    if (!model) return null;

    try {
        const result = await model(text, { pooling: 'mean', normalize: true });
        const embedding = Array.from(result.data);
        embeddingCache.set(text, embedding);
        
        // Cache nicht zu groß werden lassen
        if (embeddingCache.size > 1000) {
            const firstKey = embeddingCache.keys().next().value;
            embeddingCache.delete(firstKey);
        }

        return embedding;
    } catch (err) {
        console.error('❌ Embedding Error:', err.message);
        return null;
    }
}

/**
 * Berechne Kosinus-Ähnlichkeit zwischen zwei Embeddings
 */
function cosineSimilarity(vec1, vec2) {
    if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Hauptfunktion: Prüfe Text gegen problematische Sätze
 */
async function checkSemanticContent(text, threshold = 0.85) {
    if (!text || text.trim().length < 10) {
        // Zu kurz für semantische Analyse, nutze einfache Prüfung
        return { 
            blocked: false, 
            reason: null, 
            matching_sentences: [] 
        };
    }

    try {
        // Hole problematische Sätze aus DB
        const result = await pool.query(`
            SELECT id, satz, kategorie, prioritaet, aktion
            FROM gemeinschafts_blackliste_saetze
            WHERE ist_aktiv = TRUE
            ORDER BY prioritaet DESC
            LIMIT 100
        `);

        if (result.rows.length === 0) {
            return { blocked: false, reason: null, matching_sentences: [] };
        }

        // Generiere Embedding für neuen Text
        const newEmbedding = await getEmbedding(text);
        if (!newEmbedding) {
            return { blocked: false, reason: null, matching_sentences: [] };
        }

        const matches = [];

        // Vergleiche mit allen problematischen Sätzen
        for (const row of result.rows) {
            // Hole Embedding aus DB oder generiere neu
            let dbEmbedding = null;
            try {
                if (row.embedding_vector) {
                    dbEmbedding = JSON.parse(row.embedding_vector);
                } else {
                    // Generiere Embedding wenn nicht in DB
                    dbEmbedding = await getEmbedding(row.satz);
                    if (dbEmbedding) {
                        await pool.query(`
                            UPDATE gemeinschafts_blackliste_saetze
                            SET embedding_vector = $1
                            WHERE id = $2
                        `, [JSON.stringify(dbEmbedding), row.id]);
                    }
                }
            } catch (err) {
                console.warn(`⚠️  Fehler beim Laden des Embeddings für ID ${row.id}`);
                continue;
            }

            if (!dbEmbedding) continue;

            // Berechne Ähnlichkeit
            const similarity = cosineSimilarity(newEmbedding, dbEmbedding);

            if (similarity >= threshold) {
                console.log(`🚫 [SEMANTIC] Match: "${row.satz}" (${(similarity * 100).toFixed(1)}% ähnlich)`);
                
                matches.push({
                    id: row.id,
                    satz: row.satz,
                    kategorie: row.kategorie,
                    similarity: similarity,
                    aktion: row.aktion
                });

                // Blockieren wenn aktion = 'block' und hohe Ähnlichkeit
                if (row.aktion === 'block' && similarity >= threshold) {
                    return {
                        blocked: true,
                        reason: `❌ Dein Inhalt ähnelt einem nicht erlaubten Satz (${row.kategorie}, ${(similarity * 100).toFixed(0)}% Match)`,
                        kategorie: row.kategorie,
                        matching_sentences: matches,
                        similarity: similarity
                    };
                }
            }
        }

        // Flaggen wenn mehrere 'flag'-matches
        if (matches.some(m => m.aktion === 'flag') && matches[0].similarity >= threshold) {
            return {
                blocked: false,
                flagged: true,
                reason: `⚠️  Inhalt wird überprüft`,
                matching_sentences: matches
            };
        }

        return { 
            blocked: false, 
            reason: null, 
            matching_sentences: matches 
        };

    } catch (err) {
        console.error('❌ Semantic Moderation Error:', err.message);
        return { blocked: false, reason: null, matching_sentences: [], error: err.message };
    }
}

/**
 * Admin-Funktion: Problematischen Satz zur Blacklist hinzufügen
 */
async function addProblematicSentence(satz, kategorie, aktion = 'block', prioritaet = 50, beschreibung = null, admin_user = 'system') {
    try {
        // Generiere Embedding
        const embedding = await getEmbedding(satz);
        
        const result = await pool.query(`
            INSERT INTO gemeinschafts_blackliste_saetze
            (satz, kategorie, aktion, prioritaet, beschreibung, embedding_vector, erstellt_von)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `, [
            satz,
            kategorie,
            aktion,
            prioritaet,
            beschreibung,
            embedding ? JSON.stringify(embedding) : null,
            admin_user
        ]);

        embeddingCache.clear(); // Cache invalidieren

        console.log(`✅ Satz zur semantischen Blacklist hinzugefügt: "${satz}"`);
        return { success: true, id: result.rows[0].id };
    } catch (err) {
        console.error('❌ Fehler beim Hinzufügen:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Admin-Funktion: Satz entfernen
 */
async function removeProblematicSentence(id, admin_user = 'system') {
    try {
        await pool.query(`
            UPDATE gemeinschafts_blackliste_saetze
            SET ist_aktiv = FALSE, geloescht_von = $2
            WHERE id = $1
        `, [id, admin_user]);

        embeddingCache.clear();
        console.log(`✅ Satz aus Blacklist entfernt: ID ${id}`);
        
        return { success: true };
    } catch (err) {
        console.error('❌ Fehler beim Entfernen:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Admin-Funktion: Alle problematischen Sätze abrufen
 */
async function getProblematicSentences() {
    try {
        const result = await pool.query(`
            SELECT id, satz, kategorie, aktion, prioritaet, beschreibung, 
                   ist_aktiv, erstellt_am, erstellt_von
            FROM gemeinschafts_blackliste_saetze
            ORDER BY prioritaet DESC, erstellt_am DESC
        `);
        return result.rows;
    } catch (err) {
        console.error('❌ Fehler beim Abrufen:', err.message);
        return [];
    }
}

module.exports = {
    checkSemanticContent,
    addProblematicSentence,
    removeProblematicSentence,
    getProblematicSentences,
    getEmbedding
};