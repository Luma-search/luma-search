/**
 * CRON JOBS - Zentrale Verwaltung
 * 
 * Alle regelmäßig laufenden Jobs werden hier orchestriert
 */

const { initIPCleanupCron } = require('./ip-cleanup');
const schedule             = require('node-schedule');
const nutzerVertrauen      = require('../algorithmus/user-account-trust');
const pogoTracking         = require('../algorithmus/pogo-tracking');
const semanticAI           = require('../algorithmus/intelligence/semantic-intelligence');
const { pool }             = require('../crawler_new/db.js');

/**
 * Initialisiert alle Cron-Jobs
 */
function initAllCronJobs() {
    console.log('🔄 Initialisiere alle Cron-Jobs...\n');

    // IP-Cleanup (täglich 03:05 Uhr)
    try {
        initIPCleanupCron();
        console.log('✅ IP-Cleanup-Cron initialisiert');
    } catch (err) {
        console.error('❌ Fehler bei IP-Cleanup-Cron:', err.message);
    }

    // Pogo-Tracking + Nutzer-Vertrauen + Semantic Embeddings (täglich 03:00 Uhr)
    schedule.scheduleJob('0 3 * * *', async () => {
        console.log('\n🔄 [Cron] Tägliche Jobs starten...');

        // 1. Nutzer-Vertrauen neu berechnen
        try {
            await nutzerVertrauen.alleNutzerNeuBerechnen(pool);
            console.log('✅ [Cron] Nutzer-Vertrauen aktualisiert');
        } catch (err) {
            console.error('❌ [Cron] Nutzer-Vertrauen Fehler:', err.message);
        }

        // 2. Pogo-Tracking: Qualitätsboni aggregieren → luma_url_qualitaet
        try {
            await pogoTracking.qualitaetNeuBerechnen(pool);
            console.log('✅ [Cron] Pogo-Qualität aggregiert');
        } catch (err) {
            console.error('❌ [Cron] Pogo-Job Fehler:', err.message);
        }

        // 3. Semantische Embeddings für neue Dokumente
        if (semanticAI.isReady()) {
            try {
                await semanticAI.batchEmbedFehlende(pool, { limit: 500 });
                console.log('✅ [Cron] Semantic Embeddings aktualisiert');
            } catch (err) {
                console.error('❌ [Cron] Semantic-Job Fehler:', err.message);
            }
        }

        console.log('✨ [Cron] Tägliche Jobs abgeschlossen');
    });
    console.log('✅ Tägliche Jobs (Pogo, Vertrauen, Semantic) initialisiert (03:00 Uhr)');
}

module.exports = { initAllCronJobs };