'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LUMA – TREND ENGINE
 * Erkennt explodierende Suchanfragen in Echtzeit und verstärkt den
 * Freshness-Bonus im Ranking automatisch.
 *
 * WIE ES FUNKTIONIERT:
 *   Ein Query gilt als "Trend" wenn er in den letzten 2 Stunden deutlich
 *   öfter gesucht wurde als sein historischer Durchschnitt aus tagesstatistiken.
 *
 *   Beispiel: "ChatGPT down"
 *     Normaler Durchschnitt:  2x pro Stunde
 *     Letzte 2 Stunden:      47x → Faktor 23.5x → TREND ERKANNT
 *
 *   Auswirkung im Ranking:
 *     Normaler Freshness-Bonus: Artikel von heute = +12 Punkte
 *     Bei Trend-Query:          Artikel von heute = +12 × 3.0 = +36 Punkte
 *     → Reddit, Twitter, Nachrichtenportale steigen automatisch nach oben
 *
 * ─── DEINE BESTEHENDEN TABELLEN (keine neuen nötig!) ─────────────────────────
 *
 *  public.suchbegriffe        → trend_score, ist_trending (NEU), trend_multiplikator (NEU)
 *  public.suchprotokoll       → created_at, normalized_query (für Echtzeit-Zählung)
 *  public.tagesstatistiken    → daily_count, search_date (für historischen Vergleich)
 *  public.wochentrends        → weekly_total (für Langzeit-Kontext)
 *
 * ─── NEU IN suchbegriffe (2 Spalten via ALTER TABLE) ─────────────────────────
 *  ist_trending       BOOLEAN  DEFAULT false  (wird alle 15 Min aktualisiert)
 *  trend_multiplikator FLOAT   DEFAULT 1.0    (1.0–3.0, für ranking.js)
 *
 * ─── EINSTIEGSPUNKTE ─────────────────────────────────────────────────────────
 *   Alle 15 Min (Cron):   trendsScannen()
 *   Vor dem Ranking:      getTrendMap()
 *   Im ranking.js:        trendMap.get(query) → multiplikator
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Konfiguration ────────────────────────────────────────────────────────────

const KONFIG = {

    // Trend-Erkennung: Wieviel mal häufiger als normal = Trend?
    TREND_FAKTOR_SCHWACH:    3.0,   // 3x häufiger   → schwacher Trend
    TREND_FAKTOR_MITTEL:     8.0,   // 8x häufiger   → mittlerer Trend
    TREND_FAKTOR_STARK:     20.0,   // 20x häufiger  → starker Trend (viral)

    // Mindest-Suchen in den letzten 2 Stunden damit ein Trend gilt
    // (verhindert dass "meine-oma" bei 1→3 Suchen als Trend gilt)
    MIN_SUCHEN_ABSOLUT:      15,    // Mindestens 15 Suchen in 2h nötig

    // Zeitfenster für die Echtzeit-Zählung
    ECHTZEIT_FENSTER_STUNDEN: 2,

    // Freshness-Multiplikatoren (werden auf bestehende Freshness-Boni angewendet)
    MULTIPLIKATOR_SCHWACH:   1.5,   // +50% Freshness-Boost
    MULTIPLIKATOR_MITTEL:    2.0,   // +100% Freshness-Boost
    MULTIPLIKATOR_STARK:     3.0,   // +200% Freshness-Boost (viral)

    // Wie lange gilt ein Trend noch nach dem Abklingen?
    TREND_ABKLING_MINUTEN:   60,    // Nach 60 Min ohne neue Suchen: Trend endet

    // Mindestlänge einer Query damit sie als Trend gilt
    MIN_QUERY_LAENGE:         4,   // Mindestens 4 Zeichen — filtert 'n', 'ne', 'new', 'd' etc.

    // Scan-Intervall (wie oft trendsScannen() aufgerufen wird)
    SCAN_INTERVALL_MINUTEN:  15,

    // Maximaler Freshness-Bonus nach Multiplikation (Deckel)
    MAX_FRESHNESS_BONUS:     40,    // Nie mehr als 40 Punkte Freshness
};

// ─── Trends scannen (alle 15 Minuten) ────────────────────────────────────────

/**
 * Analysiert suchprotokoll + tagesstatistiken und aktualisiert
 * ist_trending + trend_multiplikator in suchbegriffe.
 *
 * Läuft alle 15 Minuten via setInterval in server.js.
 * Kein Cron-Job nötig — ist leichtgewichtig (nur 2 SQL-Queries).
 *
 * @param {object} dbPool - PostgreSQL Connection Pool
 * @returns {Promise<{ trending: number, beendet: number }>}
 */
async function trendsScannen(dbPool) {
    const start = Date.now();
    let trendingAnzahl = 0;
    let beendetAnzahl  = 0;

    try {

        // ── 1. Echtzeit-Zählung: Wie oft wurde jede Query in den letzten 2h gesucht?
        // Vergleich mit historischem Tagesdurchschnitt aus tagesstatistiken
        const { rows: trendKandidaten } = await dbPool.query(`
            SELECT
                s.id                                        AS suchbegriff_id,
                s.query,
                s.trend_score,
                s.ist_trending,

                -- Suchen in den letzten X Stunden (Echtzeit)
                COUNT(p.id)                                 AS suchen_echtzeit,

                -- Historischer Stunden-Durchschnitt (aus tagesstatistiken, letzte 14 Tage)
                -- daily_count / 24 = stündlicher Schnitt, × Fenster = erwartete Suchen im Fenster
                COALESCE(
                    AVG(t.daily_count) / 24.0 * $2,
                    1.0
                )                                           AS historischer_schnitt,

                -- Trend-Faktor: Echtzeit / historischer Schnitt
                CASE
                    WHEN COALESCE(AVG(t.daily_count) / 24.0 * $2, 1.0) = 0 THEN 0
                    ELSE ROUND(
                        (COUNT(p.id)::numeric
                        / NULLIF(COALESCE(AVG(t.daily_count) / 24.0 * $2, 1.0), 0))::numeric
                    , 2)
                END                                         AS trend_faktor

            FROM public.suchbegriffe s

            -- Echtzeit-Suchen der letzten 2 Stunden
            LEFT JOIN public.suchprotokoll p
                ON  p.normalized_query = s.query
                AND p.created_at      >= NOW() - ($1 || ' hours')::INTERVAL

            -- Historischer Vergleich: letzte 14 Tage (außer heute)
            LEFT JOIN public.tagesstatistiken t
                ON  t.query_id    = s.id
                AND t.search_date >= CURRENT_DATE - INTERVAL '14 days'
                AND t.search_date <  CURRENT_DATE

            WHERE s.is_active = true
              AND LENGTH(s.query) >= $4  -- Keine Einzelzeichen-Queries als Trends

            GROUP BY s.id, s.query, s.trend_score, s.ist_trending

            -- Nur Queries mit genug echten Suchen weiterbetrachten
            HAVING COUNT(p.id) >= $3
        `, [
            KONFIG.ECHTZEIT_FENSTER_STUNDEN,  // $1 – Stunden-Fenster
            KONFIG.ECHTZEIT_FENSTER_STUNDEN,  // $2 – für historischen Schnitt
            KONFIG.MIN_SUCHEN_ABSOLUT,         // $3 – Mindest-Suchen absolut
            KONFIG.MIN_QUERY_LAENGE,           // $4 – Mindest-Query-Länge
        ]);

        // ── 2. Für jeden Kandidaten Trend-Status + Multiplikator berechnen
        for (const row of trendKandidaten) {
            const faktor = parseFloat(row.trend_faktor) || 0;
            const suchenEchtzeit = parseInt(row.suchen_echtzeit) || 0;

            let istTrending        = false;
            let multiplikator      = 1.0;
            let trendStufe         = 'kein';

            if (faktor >= KONFIG.TREND_FAKTOR_STARK && suchenEchtzeit >= KONFIG.MIN_SUCHEN_ABSOLUT * 2) {
                istTrending   = true;
                multiplikator = KONFIG.MULTIPLIKATOR_STARK;
                trendStufe    = 'stark';
            } else if (faktor >= KONFIG.TREND_FAKTOR_MITTEL) {
                istTrending   = true;
                multiplikator = KONFIG.MULTIPLIKATOR_MITTEL;
                trendStufe    = 'mittel';
            } else if (faktor >= KONFIG.TREND_FAKTOR_SCHWACH) {
                istTrending   = true;
                multiplikator = KONFIG.MULTIPLIKATOR_SCHWACH;
                trendStufe    = 'schwach';
            }

            // Trend-Score aktualisieren (vorhandene Spalte)
            // Berechnung: Faktor normiert auf 0–100
            const neuerTrendScore = Math.min(100, Math.round(faktor * 3));

            // suchbegriffe aktualisieren
            await dbPool.query(`
                UPDATE public.suchbegriffe
                SET
                    trend_score          = $1,
                    ist_trending         = $2,
                    trend_multiplikator  = $3,
                    updated_at           = NOW()
                WHERE id = $4
            `, [neuerTrendScore, istTrending, multiplikator, row.suchbegriff_id]);

            if (istTrending) {
                trendingAnzahl++;
                console.log(`[TrendEngine] 🔥 TREND (${trendStufe}): "${row.query}" | ${suchenEchtzeit}x in ${KONFIG.ECHTZEIT_FENSTER_STUNDEN}h | Faktor: ${faktor}x | Boost: ×${multiplikator}`);
            }
        }

        // ── 3. Abgeklungene Trends deaktivieren
        // Queries die aktuell als trending markiert sind aber keine Echtzeit-Suchen mehr haben
        const { rowCount: beendet } = await dbPool.query(`
            UPDATE public.suchbegriffe
            SET
                ist_trending        = false,
                trend_multiplikator = 1.0,
                updated_at          = NOW()
            WHERE
                ist_trending = true
                AND updated_at < NOW() - ($1 || ' minutes')::INTERVAL
        `, [KONFIG.TREND_ABKLING_MINUTEN]);

        beendetAnzahl = beendet;

        const dauer = Date.now() - start;
        if (trendingAnzahl > 0 || beendetAnzahl > 0) {
            console.log(`[TrendEngine] Scan fertig in ${dauer}ms | ${trendingAnzahl} aktive Trends | ${beendetAnzahl} beendet`);
        }

        return { trending: trendingAnzahl, beendet: beendetAnzahl };

    } catch (fehler) {
        console.error('[TrendEngine] ✗ Fehler beim Trend-Scan:', fehler.message);
        return { trending: 0, beendet: 0 };
    }
}

// ─── Trend-Map für ranking.js laden ──────────────────────────────────────────

/**
 * Lädt alle aktiven Trends als Map.
 * Wird beim Server-Start und dann alle 15 Min neu geladen.
 *
 * Rückgabe: Map<query_string, multiplikator>
 * Beispiel: Map { "chatgpt down" → 3.0, "erdbeben türkei" → 2.0 }
 *
 * In ranking.js:
 *   const trendMult = trendMap.get(q) || 1.0;
 *   // Dann Freshness-Boni mit trendMult multiplizieren
 *
 * @param {object} dbPool
 * @returns {Promise<Map<string, number>>}
 */
async function getTrendMap(dbPool) {
    try {
        const { rows } = await dbPool.query(`
            SELECT query, trend_multiplikator, trend_score
            FROM public.suchbegriffe
            WHERE ist_trending = true
              AND is_active    = true
              AND updated_at  >= NOW() - INTERVAL '${KONFIG.TREND_ABKLING_MINUTEN} minutes'
        `);

        const map = new Map();
        for (const row of rows) {
            // Key: normalisiert (lowercase, getrimmt) — passt zu q in ranking.js
            map.set(row.query.toLowerCase().trim(), parseFloat(row.trend_multiplikator) || 1.0);
        }

        if (map.size > 0) {
            console.log(`[TrendEngine] ${map.size} aktive Trends geladen: ${[...map.keys()].join(', ')}`);
        }

        return map;

    } catch (fehler) {
        console.error('[TrendEngine] Fehler beim Laden der Trend-Map:', fehler.message);
        return new Map();
    }
}

// ─── Trending Queries für UI (z.B. "Gerade gesucht" Widget) ──────────────────

/**
 * Gibt die aktuell trendenden Suchanfragen für das Frontend zurück.
 * Kann für ein "🔥 Gerade im Trend"-Widget auf der Startseite verwendet werden.
 *
 * Aufruf: GET /api/trends
 *
 * @param {object} dbPool
 * @param {number} limit - Wie viele Trends zurückgeben (Standard: 10)
 * @returns {Promise<Array<{ query, trend_score, trend_multiplikator, trend_stufe }>>}
 */
async function getTrendingQueries(dbPool, limit = 10) {
    try {
        const { rows } = await dbPool.query(`
            SELECT
                s.query,
                s.trend_score,
                s.trend_multiplikator,
                s.search_count,
                -- Trend-Stufe als lesbares Label
                CASE
                    WHEN s.trend_multiplikator >= $1 THEN 'viral'
                    WHEN s.trend_multiplikator >= $2 THEN 'heiß'
                    ELSE 'aufsteigend'
                END AS trend_stufe,
                -- Suchen in den letzten 2 Stunden
                (
                    SELECT COUNT(*)
                    FROM public.suchprotokoll p
                    WHERE p.normalized_query = s.query
                      AND p.created_at      >= NOW() - INTERVAL '2 hours'
                ) AS suchen_letzte_2h
            FROM public.suchbegriffe s
            WHERE s.ist_trending = true
              AND s.is_active    = true
              AND s.updated_at  >= NOW() - INTERVAL '${KONFIG.TREND_ABKLING_MINUTEN} minutes'
            ORDER BY s.trend_score DESC, s.search_count DESC
            LIMIT $3
        `, [
            KONFIG.MULTIPLIKATOR_STARK,   // $1
            KONFIG.MULTIPLIKATOR_MITTEL,  // $2
            limit,                         // $3
        ]);

        return rows;

    } catch (fehler) {
        console.error('[TrendEngine] Fehler beim Abrufen der Trending Queries:', fehler.message);
        return [];
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    // Alle 15 Min via setInterval aufrufen
    trendsScannen,

    // Vor jedem Ranking-Aufruf (oder aus Cache)
    getTrendMap,

    // Für Frontend "Gerade im Trend"-Widget
    getTrendingQueries,

    // Konfiguration
    KONFIG,
};