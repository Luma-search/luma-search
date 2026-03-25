'use strict';

/**
 * LUMA – Hintergrund-Jobs (Cron)
 *
 * Starten: node cron.js  (oder in server.js einbinden: require('./cron'))
 *
 * Jobs (täglich 03:00 Uhr):
 *   1. Nutzer-Vertrauen-Neuberechnung
 *      Berechnet vertrauen_score, stimm_gewicht, stimmen_sichtbar neu,
 *      gewichtet Domain-Scores, bereinigt Burst-Log.
 *   2. Klick-Qualität aggregieren (Pogo-Sticking)
 *      Berechnet Pogo-Raten und Qualitäts-Boni pro URL,
 *      schreibt Ergebnisse in luma_url_qualitaet, bereinigt alte Signale.
 */

const nutzerVertrauen = require('./algorithmus/user-account-trust');
const pogoTracking    = require('./algorithmus/pogo-tracking');
const semanticAI      = require('./algorithmus/intelligence/semantic-intelligence');
const { pool }        = require('./crawler_new/db.js');

// ── Hilfsfunktion: Millisekunden bis zum nächsten 03:00 Uhr ─────────────────

function msUntilNextRun(stundeUhr = 3) {
    const jetzt  = new Date();
    const naechs = new Date(jetzt);
    naechs.setHours(stundeUhr, 0, 0, 0);
    if (naechs <= jetzt) naechs.setDate(naechs.getDate() + 1); // morgen
    return naechs - jetzt;
}

// ── Täglicher Vertrauen-Job ──────────────────────────────────────────────────

async function vertrauenJobAusfuehren() {
    try {
        await nutzerVertrauen.alleNutzerNeuBerechnen(pool);
    } catch (err) {
        console.error('[Cron] ✗ Fehler beim Vertrauen-Job:', err);
    }

    try {
        await pogoTracking.qualitaetNeuBerechnen(pool);
    } catch (err) {
        console.error('[Cron] ✗ Fehler beim Pogo-Job:', err);
    }

    // Semantische Embeddings für neue Dokumente berechnen
    if (semanticAI.isReady()) {
        try {
            await semanticAI.batchEmbedFehlende(pool, { limit: 500 });
        } catch (err) {
            console.error('[Cron] ✗ Fehler beim Semantic-Job:', err);
        }
    }

    // Nächsten Lauf in 24 h planen
    setTimeout(vertrauenJobAusfuehren, 24 * 60 * 60 * 1000);
}

// ── Start ────────────────────────────────────────────────────────────────────

const wartezeit = msUntilNextRun(3);
const hh = String(Math.floor(wartezeit / 3600000)).padStart(2, '0');
const mm = String(Math.floor((wartezeit % 3600000) / 60000)).padStart(2, '0');

console.log(`[Cron] Vertrauen-Job startet um 03:00 Uhr (in ${hh}h ${mm}min)`);
setTimeout(vertrauenJobAusfuehren, wartezeit);
