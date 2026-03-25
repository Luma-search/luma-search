/**
 * DUPLICATE DETECTOR
 * Erkennt Copy-Paste und plagiierten Inhalt
 *
 * Strategien:
 *  1. Fingerprint-Cache  — exakt gleiche Texte (Hash-Vergleich)
 *  2. Shingle-Similarity — fast-gleiche Texte (Jaccard-Koeffizient)
 *  3. Min-Länge          — sehr kurze Texte erlaubt (kaum Duplikat-Risiko)
 */

'use strict';

// ============================================================
// KONFIGURATION
// ============================================================

const CONFIG = {
    /** Ab dieser Zeichenanzahl wird Duplikat-Prüfung aktiv */
    minLengthForCheck: 40,

    /** Shingle-Größe (n-Gramme aus Wörtern) */
    shingleSize: 4,

    /**
     * Jaccard-Schwellwert: 0 = völlig verschieden, 1 = identisch.
     * 0.65 = 65% Übereinstimmung → als Duplikat gewertet
     */
    similarityThreshold: 0.65,

    /** Maximale Anzahl gecachter Fingerprints im Speicher */
    maxCacheSize: 5000,
};

// ============================================================
// IN-MEMORY FINGERPRINT STORE
// (In Produktion: durch Redis / DB ersetzen)
// ============================================================

/** Map<fingerprint, { text: string, createdAt: Date }> */
const _fingerprintStore = new Map();

// ============================================================
// HILFSFUNKTIONEN
// ============================================================

/**
 * Einfacher Hash (djb2) — schnell, ausreichend für Fingerprinting
 */
function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
        hash = hash >>> 0; // unsigned 32-bit
    }
    return hash.toString(36);
}

/**
 * Normalisiert Text für Vergleiche:
 * - Kleinschreibung
 * - Whitespace kollabieren
 * - Satzzeichen entfernen
 */
function normalizeForCompare(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\säöüß]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Erstellt Wort-Shingles (n-Gramme) aus einem Text
 * Beispiel: shingles("a b c d", 2) → ["a b", "b c", "c d"]
 */
function buildShingles(text, n = CONFIG.shingleSize) {
    const words = normalizeForCompare(text).split(' ').filter(Boolean);
    const shingles = new Set();
    for (let i = 0; i <= words.length - n; i++) {
        shingles.add(words.slice(i, i + n).join(' '));
    }
    return shingles;
}

/**
 * Jaccard-Ähnlichkeit zweier Sets: |A ∩ B| / |A ∪ B|
 */
function jaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1;
    let intersection = 0;
    for (const item of setA) {
        if (setB.has(item)) intersection++;
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

// ============================================================
// HAUPTFUNKTIONEN
// ============================================================

/**
 * Prüft ob ein Text ein Duplikat eines bereits gespeicherten Textes ist.
 *
 * @param {string} newText   — der neue Text (Titel oder Content)
 * @param {string} [scope]   — optionaler Scope-Prefix (z.B. "list-title")
 * @returns {{ isDuplicate: boolean, reason: string|null, similarity: number }}
 */
function checkDuplicate(newText, scope = 'global') {
    if (!newText || newText.length < CONFIG.minLengthForCheck) {
        return { isDuplicate: false, reason: null, similarity: 0 };
    }

    const normalized = normalizeForCompare(newText);
    const hash = `${scope}:${simpleHash(normalized)}`;

    // 1. Exakter Hash-Treffer
    if (_fingerprintStore.has(hash)) {
        return {
            isDuplicate: true,
            reason: 'Dieser Text wurde bereits exakt so eingetragen. Bitte formuliere ihn anders.',
            similarity: 1,
        };
    }

    // 2. Shingle-Ähnlichkeit gegen alle gespeicherten Einträge prüfen
    const newShingles = buildShingles(normalized);
    if (newShingles.size === 0) {
        return { isDuplicate: false, reason: null, similarity: 0 };
    }

    let maxSimilarity = 0;
    for (const [key, entry] of _fingerprintStore) {
        if (!key.startsWith(scope + ':')) continue;
        if (!entry.shingles) continue;

        const sim = jaccardSimilarity(newShingles, entry.shingles);
        if (sim > maxSimilarity) maxSimilarity = sim;

        if (sim >= CONFIG.similarityThreshold) {
            return {
                isDuplicate: true,
                reason: `Dein Text ist zu ähnlich zu einem bestehenden Eintrag (${Math.round(sim * 100)}% Übereinstimmung). Bitte schreibe etwas Eigenes.`,
                similarity: sim,
            };
        }
    }

    return { isDuplicate: false, reason: null, similarity: maxSimilarity };
}

/**
 * Speichert einen Text im Fingerprint-Store nachdem er akzeptiert wurde.
 * Muss nach erfolgreicher Validierung aufgerufen werden.
 *
 * @param {string} text
 * @param {string} [scope]
 */
function registerText(text, scope = 'global') {
    if (!text || text.length < CONFIG.minLengthForCheck) return;

    // Cache-Größe begrenzen (älteste Einträge löschen)
    if (_fingerprintStore.size >= CONFIG.maxCacheSize) {
        const firstKey = _fingerprintStore.keys().next().value;
        _fingerprintStore.delete(firstKey);
    }

    const normalized = normalizeForCompare(text);
    const hash = `${scope}:${simpleHash(normalized)}`;

    _fingerprintStore.set(hash, {
        shingles: buildShingles(normalized),
        createdAt: new Date(),
    });
}

/**
 * Löscht den Store (z.B. für Tests)
 */
function clearStore() {
    _fingerprintStore.clear();
}

// ============================================================
// EXPORT
// ============================================================

module.exports = { checkDuplicate, registerText, clearStore };
