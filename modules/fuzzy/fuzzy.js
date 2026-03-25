/**
 * 🔍 LUMA INTELLIGENCE - ADVANCED FUZZY SEARCH MODUL
 * "Meintest du...?" Funktionalität mit intelligenten Vorschlägen
 * 
 * Features:
 * - Levenshtein-Distance für Tippfehler-Erkennung
 * - NEU: Trigram-basierte Ähnlichkeit für robustere Erkennung
 * - Mehrere Vorschläge mit Confidence-Score
 * - Phonetische Ähnlichkeit
 * - "Meintest du...?" Box für jede Suche
 */

// ════════════════════════════════════════════════════════════════════════════════
// 1️⃣ LEVENSHTEIN DISTANZ - Berechnet Editier-Distanz zwischen Strings
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Berechnet die Levenshtein-Distanz (Edit-Distance) zwischen zwei Strings
 * Optimiert mit dynamischem Programmieren
 * @param {string} s1 - Erster String
 * @param {string} s2 - Zweiter String
 * @returns {number} - Die minimale Anzahl an Edits
 */
function getEditDistance(s1, s2) {
    // Normalisierung
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();

    if (s1 === s2) return 0;
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;

    // Optimierung: Längerer String sollte s2 sein
    if (s1.length > s2.length) {
        [s1, s2] = [s2, s1];
    }

    let v0 = new Array(s2.length + 1);
    let v1 = new Array(s2.length + 1);

    for (let i = 0; i <= s2.length; i++) {
        v0[i] = i;
    }

    for (let i = 0; i < s1.length; i++) {
        v1[0] = i + 1;

        for (let j = 0; j < s2.length; j++) {
            let cost = (s1[i] === s2[j]) ? 0 : 1;
            v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }

        for (let j = 0; j <= s2.length; j++) {
            v0[j] = v1[j];
        }
    }

    return v0[s2.length];
}

// ════════════════════════════════════════════════════════════════════════════════
// 2️⃣ ÄHNLICHKEITS-SCORE - Konvertiert Distance zu Prozent-Score
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Berechnet einen Ähnlichkeits-Score von 0-100%
 * Basiert auf Levenshtein-Distance
 * @param {string} query - Das Suchquery
 * @param {string} candidate - Das Kandidaten-Wort
 * @returns {number} - Score zwischen 0-100
 */
function calculateSimilarityScore(query, candidate) {
    const distance = getEditDistance(query, candidate);
    const maxLength = Math.max(query.length, candidate.length);
    
    if (maxLength === 0) return 100;
    
    // Umwandel: distance → similarity percentage
    const similarity = Math.max(0, maxLength - distance) / maxLength * 100;
    return Math.round(similarity);
}

// ════════════════════════════════════════════════════════════════════════════════
// 3️⃣ PHONETISCHE ÄHNLICHKEIT - Bonus für Sound-alike
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Bonus-Score für phonetisch ähnliche Wörter
 * Z.B. "Müller" ≈ "Mueller", "Schifffahrt" ≈ "Schiffahrt"
 * @param {string} query - Suchquery
 * @param {string} candidate - Kandidat
 * @returns {number} - Bonus-Score (0-10)
 */
function getPhoneticBonus(query, candidate) {
    let bonus = 0;
    
    // Umlaute normalisieren: ä→ae, ö→oe, ü→ue, ß→ss
    const normalizeUmlauts = (str) => {
        return str
            .replace(/ä/g, 'ae')
            .replace(/ö/g, 'oe')
            .replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss');
    };
    
    const q = normalizeUmlauts(query.toLowerCase());
    const c = normalizeUmlauts(candidate.toLowerCase());
    
    // Wenn Umlaut-Normalisierung Match ergibt: +5 Punkte
    if (q === c) {
        bonus += 5;
    }
    
    // Wenn erste 2 Buchstaben gleich: +2 Punkte (Präfix-Match)
    if (query.substring(0, 2).toLowerCase() === candidate.substring(0, 2).toLowerCase()) {
        bonus += 2;
    }
    
    // Wenn Längen-Differenz klein: +1 Punkt (wahrscheinlich nur Typo)
    if (Math.abs(query.length - candidate.length) <= 1) {
        bonus += 1;
    }
    
    return Math.min(bonus, 10); // Max +10 Bonus
}

// ════════════════════════════════════════════════════════════════════════════════
// 4️⃣ MULTI-MATCH VORSCHLÄGE - Findet bis zu N beste Matches
// ════════════════════════════════════════════════════════════════════════════════

// NEU: Trigram-Funktionen
/**
 * Zerlegt ein Wort in 3er-Gruppen (Trigramme) für eine robustere Ähnlichkeitsprüfung.
 * @param {string} word - Das zu zerlegende Wort.
 * @returns {Set<string>} - Ein Set von Trigrammen.
 */
function getTrigrams(word) {
    const trigrams = new Set();
    if (!word) {
        return trigrams;
    }
    // Padding hinzufügen: "__nachrichten__"
    const paddedWord = "__" + word.toLowerCase() + "__";

    for (let i = 0; i <= paddedWord.length - 3; i++) {
        trigrams.add(paddedWord.substring(i, i + 3));
    }
    return trigrams;
}

/**
 * Berechnet die Ähnlichkeit zweier Wörter basierend auf Trigrammen (Dice's Coefficient).
 * @param {string} s1 - Erster String.
 * @param {string} s2 - Zweiter String.
 * @returns {number} - Score zwischen 0-100.
 */
function calculateTrigramSimilarity(s1, s2) {
    const trigrams1 = getTrigrams(s1);
    const trigrams2 = getTrigrams(s2);

    if (trigrams1.size === 0 || trigrams2.size === 0) {
        return (s1 || "").toLowerCase() === (s2 || "").toLowerCase() ? 100 : 0;
    }

    const intersection = new Set([...trigrams1].filter(x => trigrams2.has(x)));

    const diceCoefficient = (2 * intersection.size) / (trigrams1.size + trigrams2.size);
    return Math.round(diceCoefficient * 100);
}

// Hilfsfunktion: Wörter von Satzzeichen bereinigen
function cleanWord(w) {
    return w.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
}

/**
 * Findet die besten Matches für ein Query-Wort
 * @param {string} query - Das falsch geschriebene Wort (z.B. "Heisse")
 * @param {string[]} wordList - Liste aller bekannten Wörter aus DB
 * @param {number} maxSuggestions - Max. Anzahl Vorschläge (default: 5)
 * @param {number} minScore - Minimaler Ähnlichkeits-Score (default: 60%)
 * @returns {array} - Array von {word, score, distance, confidence}
 */
function getSuggestedMatches(query, wordList, maxSuggestions = 5, minScore = 60) {
    if (!query || query.length < 2) {
        return [];
    }

    const suggestions = [];
    const uniqueWords = new Set();
    
    for (const w of wordList) {
        const clean = cleanWord(w);
        if (clean.length >= 2) uniqueWords.add(clean);
    }

    for (const word of uniqueWords) {
        // Überspringen: zu kurze Wörter oder identische Wörter
        if (word.length < 2 || word.toLowerCase() === query.toLowerCase()) {
            continue;
        }

        // Levenshtein-basierter Score
        const levenshteinScore = calculateSimilarityScore(query, word);
        
        // NEU: Trigram-basierter Score
        const trigramScore = calculateTrigramSimilarity(query, word);

        // Hybrid-Score: Levenshtein ist besser für Tippfehler, Trigram für strukturelle Ähnlichkeit.
        // Wir gewichten Levenshtein höher, da Tippfehler häufiger sind.
        let score = (levenshteinScore * 0.7) + (trigramScore * 0.3);
        
        const phoneticBonus = getPhoneticBonus(query, word);
        
        // Phonetischer Bonus erhöht Score (aber max 100)
        score = Math.min(100, score + phoneticBonus);

        // Nur Vorschläge mit ausreichend Ähnlichkeit
        if (score >= minScore) {
            suggestions.push({
                word: word,
                score: Math.round(score),
                distance: getEditDistance(query, word), // distance ist weiterhin nützlich für Debugging
                confidence: Math.round(score) // Prozent als Label
            });
        }
    }

    // Sortiere nach Score (beste zuerst)
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions.slice(0, maxSuggestions);
}

// ════════════════════════════════════════════════════════════════════════════════
// 5️⃣ MEINTEST DU FUNKTION - Die Haupt-API
// ════════════════════════════════════════════════════════════════════════════════

/**
 * ⭐ HAUPT-FUNKTION: "Meintest du...?" Vorschläge bei No-Results
 * 
 * Workflow:
 * 1. User gibt Query ein (z.B. "Heisse")
 * 2. Suche liefert 0 Ergebnisse
 * 3. Diese Funktion wird aufgerufen
 * 4. Gibt "Meintest du: [Heise, Heizen, ...]" zurück
 * 
 * @param {string} query - Das Original-Suchquery
 * @param {string[]} wordIndex - Index aller Wörter aus der DB
 * @returns {object} - {hasAlternatives, message, suggestions[], topSuggestion}
 */
function getMeintestDuSuggestions(query, wordIndex) {
    if (!query || query.trim().length === 0) {
        return {
            hasAlternatives: false,
            message: null,
            suggestions: [],
            topSuggestion: null
        };
    }

    // Mehrzeilige Suchanfragen (z.B. "olaf scholz") sind meist Namen oder Phrasen, keine Tippfehler.
    // Für solche Anfragen keine "Meintest du"-Vorschläge anzeigen.
    const words = query.trim().split(/\s+/);
    if (words.length > 1) {
        return {
            hasAlternatives: false,
            message: null,
            suggestions: [],
            topSuggestion: null
        };
    }

    // Für Einzelwort-Suchen: nach guten Matches suchen
    const queryWord = words[0];
    const normalizedQuery = cleanWord(queryWord.toLowerCase());
    
    // Prüfen, ob das Wort exakt im Index existiert (dann keine Korrektur nötig)
    const exactMatch = wordIndex.some(w => cleanWord(w).toLowerCase() === normalizedQuery);
    if (exactMatch) {
        return { hasAlternatives: false, message: null, suggestions: [], topSuggestion: null };
    }

    const suggestions = getSuggestedMatches(queryWord, wordIndex, 5);

    if (suggestions.length === 0) {
        return {
            hasAlternatives: false,
            message: null,
            suggestions: [],
            topSuggestion: null
        };
    }

    // "Meintest du...?" Message konstruieren
    // Wörter stammen aus DB-Titeln (lowercase) – HTML-Zeichen escapen bevor sie in HTML eingebettet werden
    const escapeWord = (w) => w.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const topWord = escapeWord(suggestions[0].word);

    let message = `🤔 Meintest du: <strong>${topWord}</strong>?`;
    // Alternativen nur zeigen wenn Score deutlich über dem Mindestwert liegt (≥75%)
    const goodAlternatives = suggestions.slice(1, 3).filter(s => s.score >= 75).map(s => escapeWord(s.word));
    if (goodAlternatives.length > 0) {
        const alternatives = goodAlternatives.join('</strong>, <strong>');
        message += ` (oder <strong>${alternatives}</strong>)`;
    }

    return {
        hasAlternatives: true,
        message: message,
        suggestions: suggestions.map(s => ({
            word: s.word,
            score: s.score,
            confidence: `${s.confidence}%`
        })),
        topSuggestion: suggestions[0].word, // unescaped für die Neu-Suche
        wouldYouLike: `Möchtest du stattdessen nach "${escapeWord(suggestions[0].word)}" suchen?`
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// 6️⃣ SMART AUTOCORRECT - Automatische Korrektur (optional)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Automatische Korrektur: Wenn Ähnlichkeit > 90%, auto-korrigieren
 * @param {string} query - Das Suchquery
 * @param {string[]} wordIndex - Index aller Wörter
 * @returns {object} - {originalQuery, correctedQuery, shouldCorrect, confidence}
 */
function getSmartAutocorrect(query, wordIndex) {
    const suggestions = getSuggestedMatches(query, wordIndex, 1, 85);
    
    if (suggestions.length === 0) {
        return {
            originalQuery: query,
            correctedQuery: null,
            shouldCorrect: false,
            confidence: 0
        };
    }

    const topMatch = suggestions[0];
    
    // Nur auto-korrigieren wenn Confidence sehr hoch (>90%)
    const shouldAutoCorrect = topMatch.score > 90;

    return {
        originalQuery: query,
        correctedQuery: topMatch.word,
        shouldCorrect: shouldAutoCorrect,
        confidence: topMatch.score,
        message: shouldAutoCorrect 
            ? `✓ Automatisch korrigiert: "${query}" → "${topMatch.word}"`
            : null
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// 7️⃣ TESTING & DEBUG
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Test-Funktion: Teste mit verschiedenen Tippfehlern
 * @returns {undefined} - Gibt nur Console-Output
 */
function testFuzzySearch() {
    const testIndex = [
        'heise', 'news', 'python', 'javascript', 'computer', 'programm',
        'microsoft', 'apple', 'google', 'amazon', 'tesla', 'ebay'
    ];

    const testQueries = [
        'heisse',  // ← ein Fehler
        'pythn',   // ← zwei Fehler
        'compter', // ← ein Fehler
        'programm' // ← korrekt
    ];

    console.log('\n🔍 FUZZY SEARCH TEST:\n');
    
    testQueries.forEach(query => {
        console.log(`Query: "${query}"`);
        const result = getMeintestDuSuggestions(query, testIndex);
        if (result.hasAlternatives) {
            console.log(`  ${result.message}`);
            result.suggestions.forEach((s, i) => {
                console.log(`  ${i + 1}. ${s.word} (${s.confidence})`);
            });
        } else {
            console.log('  Keine Vorschläge gefunden');
        }
        console.log('');
    });
}

// ════════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════════

module.exports = {
    // Basis-Funktionen
    getEditDistance,
    calculateSimilarityScore,
    getPhoneticBonus,
    
    // Haupt-API
    getSuggestedMatches,
    getMeintestDuSuggestions,
    getSmartAutocorrect,
    
    // Legacy (compatibility)
    findBestMatch: (query, wordList) => {
        const matches = getSuggestedMatches(query, wordList, 1, 60);
        return matches.length > 0 ? matches[0].word : null;
    },
    
    // Test-Funktion
    testFuzzySearch
};