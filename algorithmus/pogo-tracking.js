'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LUMA – KLICK-QUALITÄT, POGO-STICKING & CTR-NORMALISIERUNG
 *
 * ─── DAS PROBLEM OHNE CTR-NORMALISIERUNG ─────────────────────────────────────
 *
 *  Position 1 bekommt ~28% aller Klicks.
 *  Position 5 bekommt ~6% aller Klicks.
 *
 *  Ohne Normalisierung:
 *    URL auf Position 1 → 100 Klicks, 35 Pogos → Pogo-Rate 35%   → schwacher Malus
 *    URL auf Position 5 →  20 Klicks,  7 Pogos → Pogo-Rate 35%   → schwacher Malus
 *
 *  Das Problem: Position 1 sammelt MEHR Pogos an, nur weil sie mehr geklickt wird.
 *  Ein Pogo von Position 8 ist ein viel stärkeres Qualitätssignal als von Position 1
 *  (weil jemand der bis Position 8 scrollt, wirklich etwas sucht).
 *
 * ─── DIE LÖSUNG: POSITIONS-GEWICHTETE SIGNALE ────────────────────────────────
 *
 *  Jeder Klick bekommt ein Gewicht = 1 / ErwarteteCTR(position).
 *
 *  Ein Klick von Position 1  (CTR ~28%) hat Gewicht 1/0.285 ≈  3.5  → wenig wert
 *  Ein Klick von Position 5  (CTR  ~6%) hat Gewicht 1/0.063 ≈ 15.9  → mehr wert
 *  Ein Klick von Position 10 (CTR  ~2%) hat Gewicht 1/0.024 ≈ 41.7  → sehr viel wert
 *
 *  Normalisierte Pogo-Rate =
 *      Σ (pogo_gewicht[i]) / Σ (gesamt_gewicht[i])
 *
 *  ERGEBNIS:
 *    URL auf Position 1 → normalisierte Pogo-Rate ≈ 0.28  → kein Malus (normal für Pos. 1)
 *    URL auf Position 5 → normalisierte Pogo-Rate ≈ 0.28  → leichter Malus (erwartet wäre 0.20)
 *    URL auf Position 5 → normalisierte Pogo-Rate ≈ 0.60  → starker Malus (eindeutiges Signal)
 *
 * ─── CTR-ABWEICHUNG: ZWEITES QUALITÄTSSIGNAL ─────────────────────────────────
 *
 *  Neben der Pogo-Rate messen wir auch die CTR-Abweichung:
 *  Wie oft wird eine URL im Vergleich zur erwarteten Rate angeklickt?
 *
 *  Erwartete Impression-CTR:  URL auf Position 3 sollte ~11% bekommen.
 *  Tatsächliche CTR:          URL auf Position 3 bekommt ~18%.
 *  CTR-Abweichung:            +7 Prozentpunkte → Titel/Snippet ist attraktiv → Bonus
 *
 *  Für CTR-Abweichung brauchen wir Impressionen (wie oft wurde die URL gezeigt).
 *  Diese werden über impressionErfassen() bei jedem Suchergebnis-Aufruf erfasst.
 *
 * ─── TABELLEN ────────────────────────────────────────────────────────────────
 *
 *  public.luma_klick_signale       (bestehend, unverändert)
 *    id, url, domain, session_id, nutzer_id, position, suchanfrage,
 *    geklickt_um, verweilzeit_ms, zurueck_um, ist_pogo, ist_guter_besuch, qualitaet
 *
 *  public.luma_impressionen        (NEU – für CTR-Abweichung)
 *    url, position, suchanfrage, angezeigt_um
 *
 *  public.luma_url_qualitaet       (bestehend + 3 neue Spalten via ALTER TABLE)
 *    ... (bestehend) ...
 *    normalisierte_pogo_rate       FLOAT  (positions-gewichtet)
 *    normalisierte_gute_besuch_rate FLOAT (positions-gewichtet)
 *    ctr_abweichung                FLOAT  (tatsächliche - erwartete CTR)
 *    qualitaets_bonus              FLOAT  (jetzt auf Basis normalisierter Raten)
 *
 * ─── EINSTIEGSPUNKTE ─────────────────────────────────────────────────────────
 *   Bei Suchergebnis-Anzeige:  impressionenErfassen()  ← NEU
 *   Beim Klick:                klickErfassen()
 *   Beim Zurückkommen:         rueckkehrErfassen()
 *   Täglicher Job:             qualitaetNeuBerechnen()
 *   Im Ranking:                getUrlQualitaetMap()
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Konfiguration ────────────────────────────────────────────────────────────

const KONFIG = {

    // ── Verweilzeit-Schwellen ────────────────────────────────────────────────
    POGO_SCHWELLE_MS:        8_000,   // < 8 Sek   = Pogo (Seite war nutzlos)
    KURZ_BESUCH_MS:         20_000,   // 8–20 Sek  = kurz (noch kein klares Signal)
    GUTER_BESUCH_MS:        45_000,   // > 45 Sek  = guter Besuch
    SEHR_GUTER_BESUCH_MS:  120_000,   // > 2 Min   = sehr guter Besuch

    // ── Ranking-Boni/Mali (auf Basis normalisierter Pogo-Rate) ──────────────
    // Diese wirken erst wenn MIN_KLICKS erreicht sind
    MALUS_STARK:    -5,    // Normalisierte Pogo-Rate > 0.65
    MALUS_MITTEL:   -3,    // Normalisierte Pogo-Rate 0.45–0.65
    MALUS_LEICHT:   -1,    // Normalisierte Pogo-Rate 0.30–0.45

    BONUS_LEICHT:   +1,    // Normalisierte Gute-Besuch-Rate > 0.45
    BONUS_MITTEL:   +2,    // Normalisierte Gute-Besuch-Rate > 0.60
    BONUS_STARK:    +3,    // Normalisierte Gute-Besuch-Rate > 0.75 + genug Klicks

    // ── CTR-Abweichungs-Boni ─────────────────────────────────────────────────
    // Zusätzlicher Bonus/Malus wenn Titel/Snippet besonders oft/selten geklickt
    CTR_BONUS_STARK:   +2,   // CTR-Abweichung > +0.10 (10 Prozentpunkte über Erwartung)
    CTR_BONUS_LEICHT:  +1,   // CTR-Abweichung > +0.05
    CTR_MALUS_LEICHT:  -1,   // CTR-Abweichung < -0.05
    CTR_MALUS_STARK:   -2,   // CTR-Abweichung < -0.10

    // ── Mindest-Signale ───────────────────────────────────────────────────────
    MIN_KLICKS_FUER_MALUS:        10,   // Ab 10 gewerteten Klicks → Malus möglich
    MIN_KLICKS_FUER_BONUS:        15,   // Ab 15 gewerteten Klicks → Bonus möglich
    MIN_IMPRESSIONEN_FUER_CTR:    30,   // Ab 30 Impressionen → CTR-Abweichung werten

    // ── Signalverfall ─────────────────────────────────────────────────────────
    SIGNAL_VERFALL_TAGE:     30,   // Klicks/Impressionen älter als 30 Tage ignorieren
    IMPRESSION_VERFALL_TAGE:  7,   // Impressionen nur letzte 7 Tage (Tabelle wächst sonst)

    // ── Session-Timeout ───────────────────────────────────────────────────────
    SESSION_TIMEOUT_MIN:     30,

    // ── Erwartete CTR-Kurve pro Position (branchen-übliche Werte) ────────────
    // Quelle: Aggregierte CTR-Studien (Advanced Web Ranking, Backlinko u.a.)
    // Zeile i = Position i (Index 0 = unbekannte Position → Fallback 0.05)
    //
    //  Pos 1:  28.5%   Pos 2: 15.7%   Pos 3: 11.0%   Pos 4:  8.0%
    //  Pos 5:   6.3%   Pos 6:  5.1%   Pos 7:  4.0%   Pos 8:  3.2%
    //  Pos 9:   2.8%   Pos 10: 2.4%   Pos 11–20: linear auf ~1.0% fallend
    //
    CTR_KURVE: [
        0.050,  // [0]  Unbekannte Position → konservativer Fallback
        0.285,  // [1]  Position 1
        0.157,  // [2]  Position 2
        0.110,  // [3]  Position 3
        0.080,  // [4]  Position 4
        0.063,  // [5]  Position 5
        0.051,  // [6]  Position 6
        0.040,  // [7]  Position 7
        0.032,  // [8]  Position 8
        0.028,  // [9]  Position 9
        0.024,  // [10] Position 10
    ],

    // CTR-Abfall für Positionen 11–20 (linear interpoliert)
    CTR_POS_11_BIS_20_START: 0.020,
    CTR_POS_11_BIS_20_ENDE:  0.008,
};

// ─── Hilfsfunktion: Erwartete CTR für eine Position ──────────────────────────

/**
 * Gibt die erwartete Click-Through-Rate für eine Suchergebnis-Position zurück.
 * Basiert auf der empirischen CTR-Kurve in KONFIG.CTR_KURVE.
 *
 * @param {number} position - 1-basiert (1 = erstes Ergebnis)
 * @returns {number} Erwartete CTR als Dezimalzahl (z.B. 0.285 für 28.5%)
 */
function erwarteteCtr(position) {
    const pos = Math.round(position);

    // Gültige Kurven-Einträge (Positionen 1–10)
    if (pos >= 1 && pos <= 10) {
        return KONFIG.CTR_KURVE[pos];
    }

    // Positionen 11–20: linear fallend
    if (pos >= 11 && pos <= 20) {
        const anteil = (pos - 11) / 9; // 0.0 bis 1.0
        return KONFIG.CTR_POS_11_BIS_20_START
             + anteil * (KONFIG.CTR_POS_11_BIS_20_ENDE - KONFIG.CTR_POS_11_BIS_20_START);
    }

    // Position > 20 oder unbekannt
    return 0.005;
}

/**
 * Berechnet das Positions-Gewicht für einen Klick.
 * Klicks von tiefen Positionen zählen mehr (weil seltener geklickt wird).
 *
 * Gewicht = 1 / erwarteteCTR(position)
 *
 * @param {number} position
 * @returns {number} Gewicht ≥ 1.0
 */
function positionsGewicht(position) {
    const ctr = erwarteteCtr(position);
    return ctr > 0 ? (1 / ctr) : 20; // Fallback: Gewicht 20 bei unbekannter Position
}

// ─── Impressionen erfassen (NEU) ──────────────────────────────────────────────

/**
 * Erfasst wie oft eine URL an welcher Position gezeigt wurde.
 * Wird in server.js aufgerufen wenn Suchergebnisse an den Browser gesendet werden.
 *
 * Wichtig für CTR-Abweichungs-Berechnung:
 *   Wie oft hätte diese URL geklickt werden sollen (Erwartung)?
 *   Wie oft wurde sie tatsächlich geklickt?
 *
 * Performance: Batch-Insert für alle URLs eines Suchergebnisses auf einmal.
 *
 * Aufruf in server.js nach dem Ranking:
 *   const impressionenListe = ergebnisse.map((e, idx) => ({
 *       url: e.url, position: idx + 1, suchanfrage: query
 *   }));
 *   await impressionenErfassen(pool, impressionenListe);
 *
 * @param {object}   dbPool
 * @param {Array<{url: string, position: number, suchanfrage: string}>} impressionen
 */
async function impressionenErfassen(dbPool, impressionen) {
    if (!impressionen || impressionen.length === 0) return;

    try {
        // Batch-Insert: alle Impressionen einer Suche in einem Query
        const werte    = [];
        const params   = [];
        let   paramIdx = 1;

        for (const imp of impressionen) {
            if (!imp.url || !imp.position) continue;
            werte.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, NOW())`);
            params.push(imp.url, imp.position, imp.suchanfrage || '');
            paramIdx += 3;
        }

        if (werte.length === 0) return;

        console.log(`[CTR-Normalisierung] impressionenErfassen: ${impressionen.length} Impressionen erfasst`);

        await dbPool.query(`
            INSERT INTO public.luma_impressionen
                (url, position, suchanfrage, angezeigt_um)
            VALUES ${werte.join(', ')}
        `, params);

    } catch (fehler) {
        // Impressions-Fehler sind nicht kritisch — Suche läuft trotzdem
        console.error('[KlickQualitaet] Impression-Fehler:', fehler.message);
    }
}

// ─── Klick erfassen ───────────────────────────────────────────────────────────

/**
 * Wird aufgerufen wenn ein Nutzer auf ein Suchergebnis klickt.
 * Speichert den Klick in luma_klick_signale.
 *
 * @param {object} dbPool
 * @param {object} params
 *   @param {string}      params.url         - Geklickte URL
 *   @param {string}      params.domain      - Domain (z.B. "chip.de")
 *   @param {string}      params.sessionId   - Anonyme Session-ID
 *   @param {number|null} params.nutzerId    - Nutzer-ID falls eingeloggt
 *   @param {number}      params.position    - Position im Suchergebnis (1–20)
 *   @param {string}      params.suchanfrage - Die Suchanfrage
 * @returns {Promise<number|null>} klickId
 */
async function klickErfassen(dbPool, { url, domain, sessionId, nutzerId = null, position = 0, suchanfrage = '', quelle = 'alles' }) {
    try {
        const result = await dbPool.query(`
            INSERT INTO public.luma_klick_signale
                (url, domain, session_id, nutzer_id, position, suchanfrage, quelle, geklickt_um)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING id
        `, [url, domain, sessionId, nutzerId, position, suchanfrage, quelle]);

        return result.rows[0]?.id || null;

    } catch (fehler) {
        console.error('[KlickQualitaet] Klick-Fehler:', fehler.message);
        return null;
    }
}

// ─── Rückkehr erfassen ────────────────────────────────────────────────────────

/**
 * Wird aufgerufen wenn der Nutzer zur Suchergebnisseite zurückkommt.
 * Berechnet Verweilzeit und markiert ob es ein Pogo war.
 *
 * Zwei Wege:
 *   1. Frontend-Beacon mit klickId + verweilzeit_ms (präziser)
 *   2. Server-seitig via sessionId (schätzt Verweilzeit anhand Rückkehrzeitpunkt)
 *
 * @param {object} dbPool
 * @param {object} params
 *   @param {string}      params.sessionId      - Session-ID
 *   @param {number}      [params.klickId]      - Direkte Klick-ID (vom Frontend)
 *   @param {number}      [params.verweilzeit_ms] - Gemessene Verweilzeit (vom Frontend)
 * @returns {Promise<object|null>}
 */
async function rueckkehrErfassen(dbPool, { sessionId, klickId = null, verweilzeit_ms = null }) {
    try {
        let klickEintrag;

        if (klickId) {
            const res = await dbPool.query(`
                SELECT id, url, domain, position, geklickt_um
                FROM public.luma_klick_signale
                WHERE id = $1 AND verweilzeit_ms IS NULL
            `, [klickId]);
            klickEintrag = res.rows[0];
        } else {
            const res = await dbPool.query(`
                SELECT id, url, domain, position, geklickt_um
                FROM public.luma_klick_signale
                WHERE session_id   = $1
                  AND verweilzeit_ms IS NULL
                  AND geklickt_um  > NOW() - INTERVAL '${KONFIG.SESSION_TIMEOUT_MIN} minutes'
                ORDER BY geklickt_um DESC
                LIMIT 1
            `, [sessionId]);
            klickEintrag = res.rows[0];
        }

        if (!klickEintrag) return null;

        const verweilzeit = verweilzeit_ms !== null
            ? verweilzeit_ms
            : Math.floor(Date.now() - new Date(klickEintrag.geklickt_um).getTime());

        const istPogo        = verweilzeit < KONFIG.POGO_SCHWELLE_MS;
        const istGutBesuch   = verweilzeit >= KONFIG.GUTER_BESUCH_MS;
        const qualitaet      = _verweilzeitZuQualitaet(verweilzeit);

        // Positions-Gewicht für normalisierte Signale vorberechnen und speichern
        const posGewicht = positionsGewicht(klickEintrag.position || 0);

        await dbPool.query(`
            UPDATE public.luma_klick_signale SET
                verweilzeit_ms    = $1,
                ist_pogo          = $2,
                ist_guter_besuch  = $3,
                qualitaet         = $4,
                positions_gewicht = $5,
                zurueck_um        = NOW()
            WHERE id = $6
        `, [verweilzeit, istPogo, istGutBesuch, qualitaet, posGewicht, klickEintrag.id]);

        const posLabel = klickEintrag.position ? `Pos.${klickEintrag.position}` : 'Pos.?';
        const gewLabel = posGewicht.toFixed(1);
        console.log(`[KlickQualitaet] ${klickEintrag.domain} | ${(verweilzeit/1000).toFixed(1)}s | ${posLabel} (×${gewLabel}) | ${istPogo ? '🔴 POGO' : istGutBesuch ? '🟢 GUT' : '🟡 NEUTRAL'}`);

        return {
            url:             klickEintrag.url,
            domain:          klickEintrag.domain,
            position:        klickEintrag.position,
            verweilzeit_ms:  verweilzeit,
            positions_gewicht: posGewicht,
            ist_pogo:        istPogo,
            ist_guter_besuch: istGutBesuch,
            qualitaet,
        };

    } catch (fehler) {
        console.error('[KlickQualitaet] Rückkehr-Fehler:', fehler.message);
        return null;
    }
}

// ─── Verweilzeit → Qualitäts-Label ───────────────────────────────────────────

function _verweilzeitZuQualitaet(ms) {
    if (ms < KONFIG.POGO_SCHWELLE_MS)     return 'pogo';
    if (ms < KONFIG.KURZ_BESUCH_MS)       return 'kurz';
    if (ms < KONFIG.GUTER_BESUCH_MS)      return 'neutral';
    if (ms < KONFIG.SEHR_GUTER_BESUCH_MS) return 'gut';
    return 'sehr_gut';
}

// ─── Täglicher Job: Qualität aggregieren (mit CTR-Normalisierung) ─────────────

/**
 * Täglicher Hintergrund-Job.
 *
 * NEU gegenüber der alten Version:
 *   - Positions-gewichtete Pogo-Rate (nicht mehr naive Rohrate)
 *   - CTR-Abweichung aus luma_impressionen
 *   - qualitaets_bonus basiert auf normalisierten Raten
 *
 * @param {object} dbPool
 */
async function qualitaetNeuBerechnen(dbPool) {
    console.log('[KlickQualitaet] Starte Aggregierung (mit CTR-Normalisierung)...');
    const start = Date.now();

    try {

        // ── 1. Positions-gewichtete Signale aggregieren ──────────────────────
        //
        // positions_gewicht = 1 / erwarteteCTR(position)
        // wurde bereits beim rueckkehrErfassen() berechnet und gespeichert.
        //
        // Normalisierte Pogo-Rate    = Σ(gewicht × ist_pogo) / Σ(gewicht)
        // Normalisierte Gut-Rate     = Σ(gewicht × ist_guter_besuch) / Σ(gewicht)
        //
        // → Klicks von tiefen Positionen (selten geklickt) zählen stärker

        await dbPool.query(`
            INSERT INTO public.luma_url_qualitaet
                (url, domain,
                 gesamt_klicks, pogo_anzahl, guter_besuch_anzahl,
                 pogo_rate,             guter_besuch_rate,
                 normalisierte_pogo_rate, normalisierte_gute_besuch_rate,
                 ctr_abweichung,
                 qualitaets_bonus, aktualisiert_am)

            SELECT
                k.url,
                k.domain,

                -- ── Rohzahlen ──────────────────────────────────────────────
                COUNT(*)                                                    AS gesamt_klicks,
                COUNT(*) FILTER (WHERE k.ist_pogo = true)                   AS pogo_anzahl,
                COUNT(*) FILTER (WHERE k.ist_guter_besuch = true)           AS guter_besuch_anzahl,

                -- ── Naive Raten (behalten für Debugging) ───────────────────
                ROUND(
                    COUNT(*) FILTER (WHERE k.ist_pogo = true)::float
                    / NULLIF(COUNT(*) FILTER (WHERE k.verweilzeit_ms IS NOT NULL), 0)
                , 4)                                                        AS pogo_rate,

                ROUND(
                    COUNT(*) FILTER (WHERE k.ist_guter_besuch = true)::float
                    / NULLIF(COUNT(*) FILTER (WHERE k.verweilzeit_ms IS NOT NULL), 0)
                , 4)                                                        AS guter_besuch_rate,

                -- ── Normalisierte Raten (Kern der CTR-Normalisierung) ───────
                --
                -- Gewicht eines Klicks = 1 / ErwarteteCTR(position)
                -- Klicks von schlechten Positionen zählen stärker
                --
                -- Normalisierte Pogo-Rate:
                --   SUM(gewicht × pogo) / SUM(gewicht)
                ROUND(
                    SUM(
                        CASE WHEN k.ist_pogo = true AND k.verweilzeit_ms IS NOT NULL
                        THEN COALESCE(k.positions_gewicht, 20)
                        ELSE 0 END
                    )
                    / NULLIF(
                        SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                            THEN COALESCE(k.positions_gewicht, 20) ELSE 0 END)
                    , 0)
                , 4)                                                        AS normalisierte_pogo_rate,

                -- Normalisierte Gut-Besuch-Rate:
                ROUND(
                    SUM(
                        CASE WHEN k.ist_guter_besuch = true AND k.verweilzeit_ms IS NOT NULL
                        THEN COALESCE(k.positions_gewicht, 20)
                        ELSE 0 END
                    )
                    / NULLIF(
                        SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                            THEN COALESCE(k.positions_gewicht, 20) ELSE 0 END)
                    , 0)
                , 4)                                                        AS normalisierte_gute_besuch_rate,

                -- ── CTR-Abweichung (aus Impressionen) ────────────────────────
                --
                -- Tatsächliche CTR     = Klicks / Impressionen
                -- Erwartete CTR        = Σ(ErwarteteCTR(position)) / Anzahl Impressionen
                --                        (Durchschnitt über alle gezeigten Positionen)
                -- CTR-Abweichung       = Tatsächliche - Erwartete
                --
                -- Positiv = URL wird öfter geklickt als erwartet (guter Titel/Snippet)
                -- Negativ = URL wird seltener geklickt als erwartet (schlechter Titel)
                --
                -- NULL wenn zu wenig Impressionen vorhanden
                CASE
                    WHEN (SELECT COUNT(*) FROM public.luma_impressionen i
                          WHERE i.url = k.url
                            AND i.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'
                         ) >= $1  -- MIN_IMPRESSIONEN_FUER_CTR
                    THEN ROUND(
                        -- Tatsächliche CTR
                        COUNT(k.id)::float
                        / NULLIF((SELECT COUNT(*) FROM public.luma_impressionen i
                                  WHERE i.url = k.url
                                    AND i.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'
                                 ), 0)
                        -- minus erwartete durchschnittliche CTR dieser URL
                        - (SELECT AVG(
                                CASE
                                    WHEN i2.position BETWEEN 1  AND 10 THEN (ARRAY[
                                        0.285,0.157,0.110,0.080,0.063,
                                        0.051,0.040,0.032,0.028,0.024
                                    ])[i2.position]
                                    WHEN i2.position BETWEEN 11 AND 20
                                        THEN 0.020 - (i2.position - 11) * 0.0013
                                    ELSE 0.005
                                END
                            )
                           FROM public.luma_impressionen i2
                           WHERE i2.url = k.url
                             AND i2.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'
                          )
                    , 4)
                    ELSE NULL
                END                                                         AS ctr_abweichung,

                -- ── Qualitäts-Bonus (kombiniert, -7 bis +5) ──────────────────
                --
                -- Basis: normalisierte Pogo-Rate / Gut-Besuch-Rate
                -- Zusatz: CTR-Abweichung (wenn genug Daten)
                --
                -- Pogo-Malus:
                --   norm. Pogo-Rate > 0.65 + mind. MIN_KLICKS → -5
                --   norm. Pogo-Rate > 0.45                    → -3
                --   norm. Pogo-Rate > 0.30                    → -1
                --
                -- Gut-Besuch-Bonus:
                --   norm. Gut-Rate  > 0.75 + mind. MIN_KLICKS → +3
                --   norm. Gut-Rate  > 0.60                    → +2
                --   norm. Gut-Rate  > 0.45                    → +1
                --
                -- CTR-Abweichungs-Bonus (wenn Impressionen vorhanden):
                --   CTR +10%+                                 → +2
                --   CTR  +5%+                                 → +1
                --   CTR  -5%-                                 → -1
                --   CTR -10%-                                 → -2
                (
                    -- Pogo-Malus auf Basis normalisierter Rate
                    CASE
                        WHEN COUNT(*) FILTER (WHERE k.verweilzeit_ms IS NOT NULL) < $2
                            THEN 0
                        WHEN SUM(CASE WHEN k.ist_pogo = true AND k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END)
                             / NULLIF(SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END), 0) > 0.65
                             AND COUNT(*) >= $2
                            THEN $3  -- MALUS_STARK
                        WHEN SUM(CASE WHEN k.ist_pogo = true AND k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END)
                             / NULLIF(SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END), 0) > 0.45
                            THEN $4  -- MALUS_MITTEL
                        WHEN SUM(CASE WHEN k.ist_pogo = true AND k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END)
                             / NULLIF(SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END), 0) > 0.30
                            THEN $5  -- MALUS_LEICHT
                        -- Gut-Besuch-Bonus auf Basis normalisierter Rate
                        WHEN COUNT(*) >= $6
                             AND SUM(CASE WHEN k.ist_guter_besuch = true AND k.verweilzeit_ms IS NOT NULL
                                     THEN COALESCE(k.positions_gewicht,20) ELSE 0 END)
                                 / NULLIF(SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                                     THEN COALESCE(k.positions_gewicht,20) ELSE 0 END), 0) > 0.75
                            THEN $7  -- BONUS_STARK
                        WHEN SUM(CASE WHEN k.ist_guter_besuch = true AND k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END)
                             / NULLIF(SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END), 0) > 0.60
                            THEN $8  -- BONUS_MITTEL
                        WHEN SUM(CASE WHEN k.ist_guter_besuch = true AND k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END)
                             / NULLIF(SUM(CASE WHEN k.verweilzeit_ms IS NOT NULL
                                 THEN COALESCE(k.positions_gewicht,20) ELSE 0 END), 0) > 0.45
                            THEN $9  -- BONUS_LEICHT
                        ELSE 0
                    END
                    -- CTR-Abweichungs-Zusatz (addiert sich auf den Basis-Bonus)
                    + CASE
                        WHEN (
                            SELECT COUNT(*) FROM public.luma_impressionen i
                            WHERE i.url = k.url
                              AND i.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'
                        ) < $1 THEN 0
                        WHEN (
                            COUNT(k.id)::float
                            / NULLIF((SELECT COUNT(*) FROM public.luma_impressionen i
                                      WHERE i.url = k.url
                                        AND i.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'), 0)
                            - (SELECT AVG(CASE
                                    WHEN i2.position BETWEEN 1 AND 10 THEN (ARRAY[
                                        0.285,0.157,0.110,0.080,0.063,
                                        0.051,0.040,0.032,0.028,0.024])[i2.position]
                                    ELSE 0.010 END)
                               FROM public.luma_impressionen i2
                               WHERE i2.url = k.url
                                 AND i2.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days')
                        ) > 0.10 THEN $10  -- CTR_BONUS_STARK
                        WHEN (
                            COUNT(k.id)::float
                            / NULLIF((SELECT COUNT(*) FROM public.luma_impressionen i
                                      WHERE i.url = k.url
                                        AND i.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'), 0)
                            - (SELECT AVG(CASE
                                    WHEN i2.position BETWEEN 1 AND 10 THEN (ARRAY[
                                        0.285,0.157,0.110,0.080,0.063,
                                        0.051,0.040,0.032,0.028,0.024])[i2.position]
                                    ELSE 0.010 END)
                               FROM public.luma_impressionen i2
                               WHERE i2.url = k.url
                                 AND i2.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days')
                        ) > 0.05 THEN $11  -- CTR_BONUS_LEICHT
                        WHEN (
                            COUNT(k.id)::float
                            / NULLIF((SELECT COUNT(*) FROM public.luma_impressionen i
                                      WHERE i.url = k.url
                                        AND i.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'), 0)
                            - (SELECT AVG(CASE
                                    WHEN i2.position BETWEEN 1 AND 10 THEN (ARRAY[
                                        0.285,0.157,0.110,0.080,0.063,
                                        0.051,0.040,0.032,0.028,0.024])[i2.position]
                                    ELSE 0.010 END)
                               FROM public.luma_impressionen i2
                               WHERE i2.url = k.url
                                 AND i2.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days')
                        ) < -0.10 THEN $12  -- CTR_MALUS_STARK
                        WHEN (
                            COUNT(k.id)::float
                            / NULLIF((SELECT COUNT(*) FROM public.luma_impressionen i
                                      WHERE i.url = k.url
                                        AND i.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'), 0)
                            - (SELECT AVG(CASE
                                    WHEN i2.position BETWEEN 1 AND 10 THEN (ARRAY[
                                        0.285,0.157,0.110,0.080,0.063,
                                        0.051,0.040,0.032,0.028,0.024])[i2.position]
                                    ELSE 0.010 END)
                               FROM public.luma_impressionen i2
                               WHERE i2.url = k.url
                                 AND i2.angezeigt_um >= NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days')
                        ) < -0.05 THEN $13  -- CTR_MALUS_LEICHT
                        ELSE 0
                    END
                )                                                           AS qualitaets_bonus,

                NOW() AS aktualisiert_am

            FROM public.luma_klick_signale k
            WHERE k.geklickt_um >= NOW() - INTERVAL '${KONFIG.SIGNAL_VERFALL_TAGE} days'
              AND k.url IS NOT NULL
            GROUP BY k.url, k.domain

            ON CONFLICT (url) DO UPDATE SET
                gesamt_klicks                  = EXCLUDED.gesamt_klicks,
                pogo_anzahl                    = EXCLUDED.pogo_anzahl,
                guter_besuch_anzahl            = EXCLUDED.guter_besuch_anzahl,
                pogo_rate                      = EXCLUDED.pogo_rate,
                guter_besuch_rate              = EXCLUDED.guter_besuch_rate,
                normalisierte_pogo_rate        = EXCLUDED.normalisierte_pogo_rate,
                normalisierte_gute_besuch_rate = EXCLUDED.normalisierte_gute_besuch_rate,
                ctr_abweichung                 = EXCLUDED.ctr_abweichung,
                qualitaets_bonus               = EXCLUDED.qualitaets_bonus,
                aktualisiert_am                = NOW()
        `, [
            KONFIG.MIN_IMPRESSIONEN_FUER_CTR,  // $1
            KONFIG.MIN_KLICKS_FUER_MALUS,       // $2
            KONFIG.MALUS_STARK,                 // $3
            KONFIG.MALUS_MITTEL,                // $4
            KONFIG.MALUS_LEICHT,                // $5
            KONFIG.MIN_KLICKS_FUER_BONUS,       // $6
            KONFIG.BONUS_STARK,                 // $7
            KONFIG.BONUS_MITTEL,                // $8
            KONFIG.BONUS_LEICHT,                // $9
            KONFIG.CTR_BONUS_STARK,             // $10
            KONFIG.CTR_BONUS_LEICHT,            // $11
            KONFIG.CTR_MALUS_STARK,             // $12
            KONFIG.CTR_MALUS_LEICHT,            // $13
        ]);

        // ── 2. Alte Klick-Signale bereinigen ─────────────────────────────────
        const { rowCount: klicksGeloescht } = await dbPool.query(`
            DELETE FROM public.luma_klick_signale
            WHERE geklickt_um < NOW() - INTERVAL '${KONFIG.SIGNAL_VERFALL_TAGE} days'
        `);

        // ── 3. Alte Impressionen bereinigen ───────────────────────────────────
        const { rowCount: impressionenGeloescht } = await dbPool.query(`
            DELETE FROM public.luma_impressionen
            WHERE angezeigt_um < NOW() - INTERVAL '${KONFIG.IMPRESSION_VERFALL_TAGE} days'
        `);

        const dauer = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[KlickQualitaet] Fertig in ${dauer}s | Klicks: ${klicksGeloescht} bereinigt | Impressionen: ${impressionenGeloescht} bereinigt ✓`);

    } catch (fehler) {
        console.error('[KlickQualitaet] ✗ Fehler:', fehler);
        throw fehler;
    }
}

// ─── Qualitäts-Map für ranking.js laden ──────────────────────────────────────

/**
 * Lädt alle URL-Qualitätswerte als Map für das Ranking.
 * Wird in server.js beim Start und alle 6h neu geladen.
 *
 * @param {object} dbPool
 * @returns {Promise<Map<string, number>>}
 */
async function getUrlQualitaetMap(dbPool) {
    try {
        const { rows } = await dbPool.query(`
            SELECT url, qualitaets_bonus
            FROM public.luma_url_qualitaet
            WHERE qualitaets_bonus != 0
              AND aktualisiert_am >= NOW() - INTERVAL '2 days'
        `);

        const map = new Map();
        for (const row of rows) {
            map.set(row.url, parseFloat(row.qualitaets_bonus));
        }

        console.log(`[KlickQualitaet] ${map.size} URL-Qualitätswerte geladen`);
        return map;

    } catch (fehler) {
        console.error('[KlickQualitaet] Fehler beim Laden der Qualitäts-Map:', fehler.message);
        return new Map();
    }
}

// ─── Pogo-Rate-Map für ranking.js laden (NEU) ─────────────────────────────────

/**
 * Lädt alle URLs mit ihren normalisierten Pogo-Rates für das Ranking-Engine.
 * Diese Map wird verwendet, um das Engagement-Signal im Ranking anzupassen.
 * 
 * Die normalisierte Pogo-Rate ist positions-gewichtet:
 *   - Pogo von Position 1 (häufig geklickt) = niedriges Gewicht
 *   - Pogo von Position 10 (selten geklickt) = hohes Gewicht
 * 
 * Typische Werte:
 *   - 0.28 = erwartet normal (Position 1 durchschnittlich)
 *   - 0.60+ = schlecht (zu viele Pogos aus gute Positionen)
 *
 * @param {object} dbPool
 * @returns {Promise<Map<string, {pogoRate: number, gutRate: number, klicks: number}>>}
 */
async function getUrlPogoRateMap(dbPool) {
    try {
        const { rows } = await dbPool.query(`
            SELECT 
                url,
                normalisierte_pogo_rate,
                normalisierte_gute_besuch_rate,
                gesamt_klicks
            FROM public.luma_url_qualitaet
            WHERE gesamt_klicks >= $1
              AND aktualisiert_am >= NOW() - INTERVAL '7 days'
        `, [KONFIG.MIN_KLICKS_FUER_MALUS]);

        const map = new Map();
        for (const row of rows) {
            map.set(row.url, {
                pogoRate: parseFloat(row.normalisierte_pogo_rate || 0),
                gutRate: parseFloat(row.normalisierte_gute_besuch_rate || 0),
                klicks: row.gesamt_klicks
            });
        }

        console.log(`[KlickQualitaet] ${map.size} URLs mit Pogo-Rates geladen`);
        return map;

    } catch (fehler) {
        console.error('[KlickQualitaet] Fehler beim Laden der Pogo-Rate-Map:', fehler.message);
        return new Map();
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Echtzeit
    impressionenErfassen,      // NEU – bei jedem Suchergebnis aufrufen
    klickErfassen,
    rueckkehrErfassen,

    // Vor dem Ranking
    getUrlQualitaetMap,
    getUrlPogoRateMap,          // NEU – Pogo-Rate Map für Ranking-Integration

    // Täglicher Cron-Job
    qualitaetNeuBerechnen,

    // Hilfsfunktionen (auch für Tests)
    erwarteteCtr,
    positionsGewicht,
    _verweilzeitZuQualitaet,

    // Konfiguration
    KONFIG,
};