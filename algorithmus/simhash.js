'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LUMA – SIMHASH DUPLIKAT-ERKENNUNG
 *
 * WAS IST SIMHASH?
 *   Ein "Inhalts-Fingerabdruck" — ähnliche Texte bekommen ähnliche Hashes.
 *   Zwei Fingerabdrücke die sich in ≤ 6 Bits unterscheiden = Duplikat.
 *
 *   Beispiel:
 *     Chip.de:          "iPhone 16 Pro mit neuer Kamera vorgestellt"
 *     Computerbild.de:  "Apple stellt iPhone 16 Pro mit verbesserter Kamera vor"
 *     → Beide Hashes unterscheiden sich in 3 Bits → DUPLIKAT
 *     → Nur der mit dem höheren finalScore wird angezeigt
 *     → Der andere bekommt isDuplicate=true + canonicalUrl zeigt auf den Besseren
 *
 * WIE ES FUNKTIONIERT:
 *   1. Crawler berechnet beim Indexieren den Simhash und speichert ihn in
 *      luma_content_hashes (neue Tabelle, Migration nötig)
 *   2. ranking.js lädt Hashes für alle Ergebnis-URLs per getHashMap()
 *   3. Nach dem Scoring: applyDuplicateFilter() gruppiert ähnliche Inhalte
 *   4. Pro Gruppe wird nur der beste Treffer angezeigt
 *   5. Die anderen bekommen isDuplicate=true → Frontend kann "Ähnliche Ergebnisse"
 *      anzeigen (wie Google "mehr Ergebnisse von dieser Seite")
 *
 * ─── TABELLEN (aus migration_simhash.sql) ────────────────────────────────────
 *
 *  public.luma_content_hashes
 *    url             TEXT        PRIMARY KEY
 *    domain          TEXT
 *    simhash         BIGINT      (64-Bit Fingerabdruck)
 *    simhash_hex     TEXT        (lesbare Hex-Darstellung)
 *    content_length  INTEGER
 *    berechnet_am    TIMESTAMP
 *
 * ─── EINSTIEGSPUNKTE ─────────────────────────────────────────────────────────
 *   Im Crawler:       simhashBerechnen(text) → Hash speichern
 *   Vor dem Ranking:  getHashMap(dbPool, urls) → Map laden
 *   In ranking.js:    applyDuplicateFilter(results, hashMap) → Duplikate markieren
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Konfiguration ────────────────────────────────────────────────────────────

const KONFIG = {
    // Maximale Bit-Differenz damit zwei Texte als Duplikat gelten
    // 0 = identisch, 3 = sehr ähnlich, 6 = ähnlich, 10+ = verschieden
    DUPLIKAT_SCHWELLE:    6,

    // Maximale Anzahl der "ähnlichen Ergebnisse" die pro Gruppe versteckt werden
    // (Der Beste bleibt sichtbar, die anderen werden als Duplikat markiert)
    MAX_DUPLIKATE_PRO_GRUPPE: 5,

    // Mindest-Textlänge für Simhash (sehr kurze Texte nicht vergleichen)
    MIN_TEXT_LAENGE:    200,

    // Wie viele Top-N-Wörter für den Simhash verwenden
    TOP_N_WOERTER:      128,
};

// ─── Simhash berechnen ────────────────────────────────────────────────────────

/**
 * Berechnet einen 64-Bit Simhash für einen Text.
 * Ähnliche Texte haben ähnliche Hashes (geringe Hamming-Distanz).
 *
 * Wird im CRAWLER aufgerufen wenn eine neue Seite indexiert wird.
 *
 * Algorithmus:
 *   1. Text in Tokens aufteilen (Wörter, normalisiert)
 *   2. Jeden Token per FNV-Hash in 64-Bit-Zahl umwandeln
 *   3. Für jedes Bit: +1 wenn Token-Hash dieses Bit gesetzt, -1 sonst
 *   4. Finale Bitvektor → 1 wenn Sum > 0, sonst 0
 *
 * @param {string} text - Seiteninhalt (title + content)
 * @returns {BigInt} 64-Bit Simhash
 */
function simhashBerechnen(text) {
    if (!text || text.length < KONFIG.MIN_TEXT_LAENGE) {
        return BigInt(0);
    }

    // Text normalisieren und tokenisieren
    const tokens = _textZuTokens(text);
    if (tokens.length === 0) return BigInt(0);

    // 64-Bit Bitvektor (Zähler pro Bit)
    const v = new Array(64).fill(0);

    for (const token of tokens) {
        const hash = _fnv1aHash64(token);

        // Für jedes Bit prüfen ob es gesetzt ist
        for (let i = 0; i < 64; i++) {
            const bit = BigInt(i);
            if ((hash >> bit) & BigInt(1)) {
                v[i]++;
            } else {
                v[i]--;
            }
        }
    }

    // Bitvektor → finaler Hash
    let result = BigInt(0);
    for (let i = 0; i < 64; i++) {
        if (v[i] > 0) {
            result |= (BigInt(1) << BigInt(i));
        }
    }

    return result;
}

/**
 * Gibt den Simhash als Hex-String zurück (für DB-Speicherung lesbar).
 *
 * @param {string} text
 * @returns {string} z.B. "a3f2c1d4e5b60789"
 */
function simhashAlsHex(text) {
    const hash = simhashBerechnen(text);
    return hash.toString(16).padStart(16, '0');
}

// ─── Hamming-Distanz ──────────────────────────────────────────────────────────

/**
 * Berechnet die Hamming-Distanz zwischen zwei Simhashes.
 * = Anzahl der Bits die sich unterscheiden.
 * 0 = identisch, 64 = komplett verschieden.
 *
 * @param {BigInt} hashA
 * @param {BigInt} hashB
 * @returns {number} Anzahl der unterschiedlichen Bits (0–64)
 */
function hammingDistanz(hashA, hashB) {
    let xor = hashA ^ hashB;
    let count = 0;

    // Popcount: Anzahl der gesetzten Bits in XOR
    while (xor > BigInt(0)) {
        count += Number(xor & BigInt(1));
        xor >>= BigInt(1);
    }

    return count;
}

/**
 * Prüft ob zwei Simhashes als Duplikate gelten.
 *
 * @param {BigInt} hashA
 * @param {BigInt} hashB
 * @returns {boolean}
 */
function sindDuplikate(hashA, hashB) {
    if (hashA === BigInt(0) || hashB === BigInt(0)) return false; // Kein Hash = kein Vergleich
    return hammingDistanz(hashA, hashB) <= KONFIG.DUPLIKAT_SCHWELLE;
}

// ─── Hash-Map aus DB laden ────────────────────────────────────────────────────

/**
 * Lädt die Simhashes für eine Liste von URLs aus der DB.
 * Wird in server.js VOR dem Ranking-Aufruf geladen.
 *
 * @param {object} dbPool
 * @param {string[]} urls - Liste der URLs aus den Ranking-Ergebnissen
 * @returns {Promise<Map<string, BigInt>>} Map<url, simhash>
 */
async function getHashMap(dbPool, urls) {
    if (!urls || urls.length === 0) return new Map();

    try {
        const { rows } = await dbPool.query(`
            SELECT url, simhash
            FROM public.luma_content_hashes
            WHERE url = ANY($1::text[])
              AND simhash IS NOT NULL
              AND simhash != 0
        `, [urls]);

        const map = new Map();
        for (const row of rows) {
            try {
                map.set(row.url, BigInt(row.simhash));
            } catch {
                // Ungültiger Hash → überspringen
            }
        }

        console.log(`[Simhash] getHashMap: ${map.size}/${urls.length} URLs mit Hash gefunden`);
        return map;

    } catch (fehler) {
        console.error('[Simhash] Fehler beim Laden der Hash-Map:', fehler.message);
        return new Map();
    }
}

// ─── Duplikat-Filter für ranking.js ──────────────────────────────────────────

/**
 * Gruppiert ähnliche Ergebnisse und markiert Duplikate.
 * Wird in ranking.js nach dem Scoring und VOR der Domain-Vielfalt aufgerufen.
 *
 * Die Ergebnisse müssen bereits nach finalScore sortiert sein.
 * Innerhalb einer Duplikat-Gruppe gewinnt immer das beste Ergebnis.
 *
 * Beispiel Input:
 *   [
 *     { url: "chip.de/iphone", finalScore: 82, ... },         ← bleibt sichtbar
 *     { url: "computerbild.de/iphone", finalScore: 71, ... }, ← DUPLIKAT
 *     { url: "heise.de/linux", finalScore: 69, ... },         ← kein Duplikat
 *   ]
 *
 * Beispiel Output:
 *   [
 *     { url: "chip.de/iphone", finalScore: 82, isDuplicate: false },
 *     { url: "computerbild.de/iphone", isDuplicate: true, canonicalUrl: "chip.de/iphone" },
 *     { url: "heise.de/linux", finalScore: 69, isDuplicate: false },
 *   ]
 *
 * @param {Array}  results  - Ranking-Ergebnisse (bereits nach Score sortiert)
 * @param {Map}    hashMap  - Map<url, BigInt> aus getHashMap()
 * @returns {{ results: Array, duplikateAnzahl: number, gruppen: number }}
 */
function applyDuplicateFilter(results, hashMap) {
    if (!hashMap || hashMap.size === 0) {
        return { results, duplikateAnzahl: 0, gruppen: 0 };
    }

    let duplikateAnzahl = 0;
    let gruppenAnzahl   = 0;

    // Für jedes Ergebnis: isDuplicate + canonicalUrl setzen
    const verarbeitet = new Set(); // URLs die bereits einer Gruppe zugeordnet sind

    for (let i = 0; i < results.length; i++) {
        const item = results[i];
        if (verarbeitet.has(item.url)) continue; // Bereits als Duplikat markiert

        item.isDuplicate  = false;
        item.canonicalUrl = null;
        item.duplikatVon  = [];

        const hashA = hashMap.get(item.url);
        if (!hashA) continue; // Kein Hash = nicht vergleichen

        let duplikateInGruppe = 0;

        // Mit allen nachfolgenden Ergebnissen vergleichen
        for (let j = i + 1; j < results.length; j++) {
            const kandidat = results[j];
            if (verarbeitet.has(kandidat.url)) continue;

            const hashB = hashMap.get(kandidat.url);
            if (!hashB) continue;

            if (sindDuplikate(hashA, hashB) && duplikateInGruppe < KONFIG.MAX_DUPLIKATE_PRO_GRUPPE) {
                // Kandidat ist Duplikat von item (item hat höheren Score = Gewinner)
                const distance = hammingDistanz(hashA, hashB);
                console.log(`   [Simhash] DUPLIKAT erkannt | ${item.url?.slice(0, 35)} ← ${kandidat.url?.slice(0, 35)} (${distance} Bits)`);
                
                kandidat.isDuplicate  = true;
                kandidat.canonicalUrl = item.url;
                verarbeitet.add(kandidat.url);
                item.duplikatVon.push(kandidat.url);
                duplikateAnzahl++;
                duplikateInGruppe++;
            }
        }

        if (duplikateInGruppe > 0) {
            gruppenAnzahl++;
        }

        verarbeitet.add(item.url);
    }

    console.log(`[Simhash] applyDuplicateFilter: ${duplikateAnzahl} Duplikate in ${gruppenAnzahl} Gruppen erkannt`);
    return { results, duplikateAnzahl, gruppen: gruppenAnzahl };
}

// ─── Interne Hilfsfunktionen ──────────────────────────────────────────────────

/**
 * Text in normalisierte Tokens aufteilen.
 * Stopwörter entfernen, auf die N häufigsten Tokens begrenzen.
 */
function _textZuTokens(text) {
    const STOP = new Set([
        'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'ist', 'sind',
        'hat', 'war', 'für', 'mit', 'von', 'auf', 'bei', 'den', 'dem',
        'the', 'a', 'an', 'and', 'or', 'is', 'are', 'was', 'for', 'with',
    ]);

    const woerter = text
        .toLowerCase()
        .replace(/[^a-zäöüß0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOP.has(w));

    // Häufigste N Wörter (Frequenz-basiert)
    const freq = new Map();
    for (const w of woerter) {
        freq.set(w, (freq.get(w) || 0) + 1);
    }

    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, KONFIG.TOP_N_WOERTER)
        .map(([wort]) => wort);
}

/**
 * FNV-1a Hash für einen String (64-Bit als BigInt).
 * Schnell und gut verteilt für kurze Strings.
 */
function _fnv1aHash64(str) {
    const FNV_PRIME  = BigInt('0x00000100000001B3');
    const FNV_OFFSET = BigInt('0xcbf29ce484222325');

    let hash = FNV_OFFSET;
    for (let i = 0; i < str.length; i++) {
        hash ^= BigInt(str.charCodeAt(i));
        hash  = BigInt.asUintN(64, hash * FNV_PRIME);
    }
    return hash;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Im Crawler: Hash berechnen und in DB speichern
    simhashBerechnen,
    simhashAlsHex,

    // Vergleich
    hammingDistanz,
    sindDuplikate,

    // Vor dem Ranking (in server.js)
    getHashMap,

    // In ranking.js (nach Scoring, vor Domain-Vielfalt)
    applyDuplicateFilter,

    // Konfiguration
    KONFIG,
};