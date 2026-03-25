/**
 * Erstellt das Gemeinschafts-Blacklist-System
 * Mit Regex-Unterstützung, Prioritäten und Admin-Verwaltung
 */

const { pool } = require('../crawler_new/db.js');

async function setupBlacklist() {
    try {
        console.log('🔄 Erstelle Blacklist-Tabelle...');

        // Blacklist-Tabelle mit Regex, Priorität und Kategorien
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS gemeinschafts_blackliste (
                    id SERIAL PRIMARY KEY,
                    pattern TEXT NOT NULL UNIQUE,  -- Regex-Pattern oder exakte Phrase
                    typ VARCHAR(20) DEFAULT 'phrase',  -- 'phrase' oder 'regex'
                    kategorie VARCHAR(50),  -- z.B. 'hate-speech', 'spam', 'explicit', 'ads'
                    prioritaet INTEGER DEFAULT 0,  -- Höher = wichtiger
                    aktion VARCHAR(20) DEFAULT 'block',  -- 'block', 'flag', 'warn'
                    beschreibung TEXT,
                    ist_aktiv BOOLEAN DEFAULT TRUE,
                    erstellt_am TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    aktualisiert_am TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                    erstellt_von VARCHAR(100),  -- Admin-Username
                    loeschgruende TEXT  -- Warum wurde das Wort blacklisted?
                );
            `);
            console.log('✅ Blacklist-Tabelle erstellt');
        } catch (tableErr) {
            // Tabelle existiert vielleicht schon
            console.log('⚠️  Tabelle erstellt oder existiert bereits');
        }

        // Index für Performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS gemeinschafts_blackliste_aktiv_idx 
            ON gemeinschafts_blackliste(ist_aktiv, prioritaet DESC);
        `);
        console.log('✅ Performance-Index erstellt');

        // Initiale Standard-Blacklist
        const blacklistItems = [
            // Hate Speech (höchste Priorität)
            { pattern: 'nigger|neger', typ: 'regex', kategorie: 'hate-speech', prioritaet: 100, aktion: 'block', beschreibung: 'Rassistisches Wort' },
            { pattern: 'faggot|homo[a-z]*', typ: 'regex', kategorie: 'hate-speech', prioritaet: 100, aktion: 'block', beschreibung: 'Homophobes Wort' },
            { pattern: 'jude[^ ]*|jüd[^ ]*', typ: 'regex', kategorie: 'hate-speech', prioritaet: 100, aktion: 'block', beschreibung: 'Antisemitisch' },
            
            // Extremismus und Gewalt
            { pattern: 'kill yourself|töte dich selbst', typ: 'regex', kategorie: 'violent', prioritaet: 90, aktion: 'block', beschreibung: 'Selbstverletzungs-Ermutigung' },
            { pattern: 'terror[a-z]*|bombe|schießen', typ: 'regex', kategorie: 'violent', prioritaet: 90, aktion: 'block', beschreibung: 'Gewalt/Terrorismus' },
            
            // Explizite Sexuelle Inhalte
            { pattern: 'porn[a-z]*|sex[^ ]*', typ: 'regex', kategorie: 'explicit', prioritaet: 70, aktion: 'flag', beschreibung: 'Expliziter Inhalt' },
            
            // Spam und Betrug
            { pattern: 'viagra|cialis|casino', typ: 'regex', kategorie: 'spam', prioritaet: 50, aktion: 'flag', beschreibung: 'Pharma-Spam' },
            { pattern: 'click here|visit now', typ: 'regex', kategorie: 'spam', prioritaet: 50, aktion: 'flag', beschreibung: 'Spam-Links' },
            { pattern: 'bitcoin|ethereum|crypto scam', typ: 'regex', kategorie: 'spam', prioritaet: 60, aktion: 'block', beschreibung: 'Crypto-Betrug' },
            
            // Phishing/Malware
            { pattern: 'confirm your password|verify account', typ: 'regex', kategorie: 'fraud', prioritaet: 80, aktion: 'block', beschreibung: 'Phishing' },
            { pattern: 'download malware|click virus', typ: 'regex', kategorie: 'fraud', prioritaet: 80, aktion: 'block', beschreibung: 'Malware-Werbung' }
        ];

        for (const item of blacklistItems) {
            try {
                await pool.query(`
                    INSERT INTO gemeinschafts_blackliste 
                    (pattern, typ, kategorie, prioritaet, aktion, beschreibung, erstellt_von)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (pattern) DO NOTHING
                `, [
                    item.pattern,
                    item.typ,
                    item.kategorie,
                    item.prioritaet,
                    item.aktion,
                    item.beschreibung,
                    'system'
                ]);
            } catch (itemErr) {
                console.warn(`⚠️  Fehler beim Einfügen von "${item.pattern}":`, itemErr.message);
            }
        }
        console.log('✅ Standard-Blacklist-Einträge eingefügt');

        // Trigger für auto-update Zeitstempel
        await pool.query(`
            CREATE OR REPLACE FUNCTION update_blacklist_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.aktualisiert_am = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);

        await pool.query(`
            DROP TRIGGER IF EXISTS trigger_blacklist_updated_at ON gemeinschafts_blackliste;
            CREATE TRIGGER trigger_blacklist_updated_at
            BEFORE UPDATE ON gemeinschafts_blackliste
            FOR EACH ROW
            EXECUTE FUNCTION update_blacklist_updated_at();
        `);
        console.log('✅ Auto-Update-Trigger erstellt');

        console.log('\n🎯 Blacklist-Konfiguration:');
        
        const statResult = await pool.query(`
            SELECT kategorie, COUNT(*) as count
            FROM gemeinschafts_blackliste 
            WHERE ist_aktiv = TRUE
            GROUP BY kategorie
            ORDER BY COUNT(*) DESC;
        `);
        
        statResult.rows.forEach(row => {
            console.log(`  📌 ${row.kategorie}: ${row.count} Einträge`);
        });

        console.log('\n✨ Blacklist-System erfolgreich eingerichtet!');

    } catch (err) {
        console.error('❌ Fehler beim Blacklist-Setup:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

setupBlacklist();
