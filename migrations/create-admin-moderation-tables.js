/**
 * Migration: Erstelle Admin-Moderation-Tables
 */

const { pool } = require('../crawler_new/db.js');

async function setupModerationAdminTables() {
    try {
        console.log('🔄 Erstelle Admin-Moderation Tabellen...');

        // Tabelle für Moderator-Aktionen auf Verdicts
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS gemeinschafts_moderation_actions (
                    id SERIAL PRIMARY KEY,
                    verdict_id INTEGER NOT NULL UNIQUE,
                    action VARCHAR(20) NOT NULL, -- 'approved', 'rejected', 'ignored'
                    moderator_note TEXT,
                    action_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (verdict_id) REFERENCES gemeinschafts_moderation_verdicts(id)
                );
            `);
            console.log('✅ Moderation-Actions Tabelle erstellt');
        } catch (err) {
            console.log('⚠️  Tabelle existiert bereits');
        }

        // Index für Performance
        try {
            await pool.query(`
                CREATE INDEX IF NOT EXISTS gemeinschafts_moderation_actions_action_idx 
                ON gemeinschafts_moderation_actions(action, action_timestamp DESC);
            `);
            console.log('✅ Index erstellt');
        } catch (err) {
            console.log('⚠️  Index existiert bereits');
        }

        console.log('\n✨ Admin-Moderation Tabellen erfolgreich eingerichtet!');

    } catch (err) {
        console.error('❌ Fehler:', err.message);
    } finally {
        await pool.end();
    }
}

setupModerationAdminTables();
