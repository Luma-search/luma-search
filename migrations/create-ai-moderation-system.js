/**
 * AI-basierte semantische Moderation
 * Speichert problematische Sätze (mit Kontext) statt einzelner Wörter
 */

const { pool } = require('../crawler_new/db.js');

async function setupAIModeration() {
    try {
        console.log('🔄 Erstelle AI-Moderation Tabellen...');

        // Tabelle für problematische Sätze (mit Kontext & Kategorie)
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS gemeinschafts_moderation_patterns (
                    id SERIAL PRIMARY KEY,
                    satz TEXT NOT NULL UNIQUE,
                    kategorie VARCHAR(50) NOT NULL,
                    grund TEXT,
                    aktion VARCHAR(20) DEFAULT 'block',
                    prioritaet INTEGER DEFAULT 50,
                    ist_aktiv BOOLEAN DEFAULT TRUE,
                    erstellt_am TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    aktualisiert_am TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    erstellt_von VARCHAR(100)
                );
            `);
            console.log('✅ Moderation-Patterns Tabelle erstellt');
        } catch (err) {
            console.log('⚠️  Tabelle existiert bereits');
        }

        // Index für Performance
        try {
            await pool.query(`
                CREATE INDEX IF NOT EXISTS gemeinschafts_moderation_patterns_aktiv_idx 
                ON gemeinschafts_moderation_patterns(ist_aktiv, prioritaet DESC);
            `);
            console.log('✅ Index erstellt');
        } catch (err) {
            console.log('⚠️  Index existiert bereits');
        }

        // Tabelle für Moderation-Verdicts (Audit-Trail)
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS gemeinschafts_moderation_verdicts (
                    id SERIAL PRIMARY KEY,
                    beitrag_typ VARCHAR(50),
                    beitrag_id INTEGER,
                    text TEXT,
                    erkennte_muster TEXT,
                    ahnlichkeit_score NUMERIC(5, 3),
                    aktion VARCHAR(20),
                    kategorie VARCHAR(50),
                    nutzer_ip VARCHAR(50),
                    geblocked BOOLEAN,
                    geflagged BOOLEAN,
                    geprueft_am TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log('✅ Moderation-Verdicts Tabelle erstellt');
        } catch (err) {
            console.log('⚠️  Verdicts-Tabelle existiert bereits');
        }

        // Initiale problematische Sätze
        const patterns = [
            // Gewalt mit echten Drohungen
            { satz: 'ich werde dich töten', kategorie: 'violent', grund: 'TodesDrohung', aktion: 'block', prioritaet: 100 },
            { satz: 'ich höffe du stirbst', kategorie: 'violent', grund: 'Todeswunsch', aktion: 'block', prioritaet: 100 },
            { satz: 'ich bring dich um', kategorie: 'violent', grund: 'Mord-Drohung', aktion: 'block', prioritaet: 100 },
            { satz: 'du solltest dich umbringen', kategorie: 'violent', grund: 'Selbstmord-Ermutigung', aktion: 'block', prioritaet: 100 },
            
            // Rassismus & Extremismus
            { satz: 'alle muslime sind bomben', kategorie: 'hate-speech', grund: 'Rassistische Verallgemeinerung', aktion: 'block', prioritaet: 100 },
            { satz: 'juden kontrollieren die welt', kategorie: 'hate-speech', grund: 'Antisemitische Verschwörung', aktion: 'block', prioritaet: 100 },
            { satz: 'schwarze Menschen sind primitiv', kategorie: 'hate-speech', grund: 'Rassistische Beleidigung', aktion: 'block', prioritaet: 100 },
            
            // Sexuelle Belästigung
            { satz: 'du bist ein echter schlampe', kategorie: 'harassment', grund: 'Sexuelle Belästigung', aktion: 'flag', prioritaet: 80 },
            { satz: 'ich will dich vergewaltigen', kategorie: 'harassment', grund: 'Vergewaltigungs-Drohung', aktion: 'block', prioritaet: 100 },
            
            // Beleidigungen/Schimpfwörter als Sätze
            { satz: 'du sau', kategorie: 'insult', grund: 'Beleidigung', aktion: 'flag', prioritaet: 60 },
            { satz: 'du bist so dumm', kategorie: 'insult', grund: 'Persönliche Beleidigung', aktion: 'flag', prioritaet: 60 },
            { satz: 'idiot', kategorie: 'insult', grund: 'Beleidigung', aktion: 'flag', prioritaet: 50 },
            { satz: 'du arschloch', kategorie: 'insult', grund: 'Derbe Beleidigung', aktion: 'flag', prioritaet: 65 },
            
            // Betrug & Scams
            { satz: 'gib mir dein passwort für', kategorie: 'fraud', grund: 'Phishing-Versuch', aktion: 'block', prioritaet: 100 },
            { satz: 'investiere jetzt in diese geheime kryptowährung', kategorie: 'fraud', grund: 'Krypto-Betrug-Angebot', aktion: 'block', prioritaet: 90 },
        ];

        let insertCount = 0;
        for (const pattern of patterns) {
            try {
                await pool.query(`
                    INSERT INTO gemeinschafts_moderation_patterns 
                    (satz, kategorie, grund, aktion, prioritaet, erstellt_von)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (satz) DO NOTHING
                `, [
                    pattern.satz,
                    pattern.kategorie,
                    pattern.grund,
                    pattern.aktion,
                    pattern.prioritaet,
                    'system'
                ]);
                insertCount++;
            } catch (err) {
                console.warn(`⚠️  "${pattern.satz}":`, err.message);
            }
        }
        
        console.log(`✅ ${insertCount} Moderation-Patterns eingefügt`);

        const stats = await pool.query(`
            SELECT kategorie, COUNT(*) as count
            FROM gemeinschafts_moderation_patterns 
            WHERE ist_aktiv = TRUE
            GROUP BY kategorie
        `);
        
        console.log('\n🎯 Moderation-Kategorien:');
        stats.rows.forEach(row => {
            console.log(`  📌 ${row.kategorie}: ${row.count} Muster`);
        });

        console.log('\n✨ AI-Moderation System erfolgreich eingerichtet!');

    } catch (err) {
        console.error('❌ Fehler:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setupAIModeration();
