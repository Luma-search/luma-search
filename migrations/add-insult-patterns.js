/**
 * Migration: Beleidigungsmuster zur AI-Moderation hinzufügen
 * 
 * Diese Muster werden GEFLAGGED (nicht geblockt), weil:
 * - Sie spielerisch gemeint sein können
 * - Sie sarkastisch sein können  
 * - Die Community-Moderation sie bewerten kann
 * 
 * Beispiele:
 * ✅ KÖNNEN geschrieben werden (sarkastisch gemeint):
 *    - "du sollst dich löschen du sau" (spielerisch)
 *    - "nein, du sau mach dich einfach weg" (sarkastisch)
 *    
 * 🚫 SOLLTEN NICHT geschrieben werden (echte Beleidigungen):
 *    - "du sau" (direkter Angriff)
 *    - "du bist so dumm" (persönlicher Angriff)
 */

const { pool } = require('../crawler_new/db.js');

async function addInsultPatterns() {
    try {
        console.log('🔄 Füge Beleidigungsmuster zur AI-Moderation hinzu...\n');

        // Beleidigungsmuster (werden GEFLAGGED, nicht geblockt)
        // WICHTIG: Allgemeine semantische Muster statt spezifischer Sätze
        // Das ermöglicht, dass "du sollst dich löschen du sau" oder "mach dich weg du sau" erkannt werden
        const insultPatterns = [
            // Allgemeine Beleidigungsmuster (erfasst Variationen)
            { satz: 'du bist gemeiner als sonst', kategorie: 'insult', grund: 'Beleidigung/Herabwürdigung', aktion: 'flag', prioritaet: 70 },
            { satz: 'du bist charakterlos und gemein', kategorie: 'insult', grund: 'Persönliche Beleidigung', aktion: 'flag', prioritaet: 70 },
            { satz: 'du verdienst nur das schlechteste', kategorie: 'insult', grund: 'Verachtungsaussage', aktion: 'flag', prioritaet: 65 },
            
            // Direkter Hass/Verachtung
            { satz: 'ich verabscheue dich', kategorie: 'insult', grund: 'Verachtungsaussage', aktion: 'flag', prioritaet: 70 },
            { satz: 'du bist widerlich', kategorie: 'insult', grund: 'Beleidigung', aktion: 'flag', prioritaet: 65 },
        ];

        let addedCount = 0;
        let skippedCount = 0;

        for (const pattern of insultPatterns) {
            try {
                const result = await pool.query(`
                    INSERT INTO gemeinschafts_moderation_patterns 
                    (satz, kategorie, grund, aktion, prioritaet, erstellt_von)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (satz) DO UPDATE 
                    SET aktion = $4, grund = $3, prioritaet = $5
                `, [
                    pattern.satz,
                    pattern.kategorie,
                    pattern.grund,
                    pattern.aktion,
                    pattern.prioritaet,
                    'system-migration'
                ]);

                console.log(`✅ "${pattern.satz}" (${pattern.kategorie}) - Aktion: ${pattern.aktion}`);
                addedCount++;
            } catch (err) {
                console.warn(`⚠️  "${pattern.satz}":`, err.message);
                skippedCount++;
            }
        }

        console.log(`\n📊 Resultat: ${addedCount} Muster hinzugefügt, ${skippedCount} übersprungen`);

        // Statistik anzeigen
        const stats = await pool.query(`
            SELECT kategorie, COUNT(*) as count
            FROM gemeinschafts_moderation_patterns 
            WHERE ist_aktiv = TRUE
            GROUP BY kategorie
            ORDER BY count DESC
        `);
        
        console.log('\n🎯 Aktuelle Moderation-Kategorien:');
        stats.rows.forEach(row => {
            console.log(`  📌 ${row.kategorie}: ${row.count} Muster`);
        });

        console.log('\n✨ Migration erfolgreich abgeschlossen!');

    } catch (err) {
        console.error('❌ Fehler:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

addInsultPatterns();
