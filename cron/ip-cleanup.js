/**
 * CRON JOB: IP-Cleanup für Community-Inhalte
 * 
 * Löscht IPs nach definierten Löschfristen:
 * - Normal Posts: 2 Wochen
 * - Gemeldete Inhalte: 1 Jahr
 * 
 * Läuft täglich um 3:05 Uhr
 */

const schedule = require('node-schedule');
const { pool } = require('../crawler_new/db.js');

function initIPCleanupCron() {
    // Täglich um 3:05 Uhr laufen lassen
    schedule.scheduleJob('5 3 * * *', async () => {
        try {
            console.log('\n🗑️  [IP-CLEANUP] Starte IP-Löschung...');
            const start = Date.now();

            // 1. Community-Listen: IPs löschen wenn Löschfrist erreicht
            const listenRes = await pool.query(`
                UPDATE community_listen 
                SET erstellt_von_ip = NULL, ip_geloescht = TRUE 
                WHERE ip_loeschfrist_am <= NOW() 
                AND ip_geloescht = FALSE
            `);
            
            console.log(`   ✅ Community-Listen: ${listenRes.rowCount} IPs gelöscht`);

            // 2. Community-Einträge: IPs löschen wenn Löschfrist erreicht
            const eintraegeRes = await pool.query(`
                UPDATE community_liste_eintraege 
                SET erstellt_von_ip = NULL, ip_geloescht = TRUE 
                WHERE ip_loeschfrist_am <= NOW() 
                AND ip_geloescht = FALSE
            `);
            
            console.log(`   ✅ Community-Einträge: ${eintraegeRes.rowCount} IPs gelöscht`);

            // 3. Gemeldete Inhalte: IPs löschen wenn Löschfrist (1 Jahr) erreicht
            const meldungenRes = await pool.query(`
                UPDATE gemeinschafts_meldungen 
                SET ziel_nutzer_ip = NULL 
                WHERE ip_loeschfrist_am <= NOW() 
                AND ziel_nutzer_ip IS NOT NULL
            `);
            
            console.log(`   ✅ Gemeldete Inhalte: ${meldungenRes.rowCount} IPs gelöscht`);

            const duration = Date.now() - start;
            const totalDeleted = listenRes.rowCount + eintraegeRes.rowCount + meldungenRes.rowCount;
            
            console.log(`\n✨ IP-Cleanup abgeschlossen (${totalDeleted} IPs gelöscht, ${duration}ms)`);
            
        } catch (err) {
            console.error('❌ IP-Cleanup Fehler:', err.message);
        }
    });

    console.log('✨ IP-Cleanup Cron initialisiert (täglich 03:05 Uhr)');
}

module.exports = { initIPCleanupCron };
