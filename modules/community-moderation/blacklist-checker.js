/**
 * Blacklist-Checker für Community-Inhalte
 * Prüft Texte gegen die Datenbank-Blacklist
 */

const { pool } = require('../../crawler_new/db.js');

let blacklistCache = [];
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 Minuten Cache

/**
 * Blacklist aus Cache laden (mit Auto-Refresh)
 */
async function getBlacklist() {
    const now = Date.now();
    
    // Cache erneuern wenn älter als 5 Min
    if (blacklistCache.length === 0 || now - cacheTime > CACHE_DURATION) {
        try {
            const result = await pool.query(`
                SELECT id, pattern, typ, kategorie, prioritaet, aktion 
                FROM gemeinschafts_blackliste 
                WHERE ist_aktiv = TRUE
                ORDER BY prioritaet DESC
            `);
            blacklistCache = result.rows;
            cacheTime = now;
            console.log(`🔄 Blacklist Cache aktualisiert (${blacklistCache.length} Einträge)`);
        } catch (err) {
            console.error('❌ Fehler beim Laden der Blacklist:', err.message);
            return blacklistCache; // Fallback zu altem Cache
        }
    }
    
    return blacklistCache;
}

/**
 * Hauptfunktion: Text gegen Blacklist prüfen
 * Gibt { blocked: boolean, grund?: string, action?: string, kategorie?: string } zurück
 */
async function checkBlacklist(text) {
    if (!text || typeof text !== 'string') {
        return { blocked: false };
    }

    const blacklist = await getBlacklist();
    const normalizedText = text.toLowerCase().trim();

    for (const entry of blacklist) {
        let matched = false;

        try {
            if (entry.typ === 'regex') {
                // Regex-Check mit Flags (case-insensitive)
                const regex = new RegExp(entry.pattern, 'i');
                matched = regex.test(normalizedText);
            } else {
                // Exakte Phrase (substring)
                matched = normalizedText.includes(entry.pattern.toLowerCase());
            }

            if (matched) {
                console.log(`🚫 [BLACKLIST] Gefunden: "${entry.pattern}" (${entry.kategorie}) - Aktion: ${entry.aktion}`);
                
                return {
                    blocked: entry.aktion === 'block',
                    flagged: entry.aktion === 'flag',
                    grund: entry.pattern,
                    kategorie: entry.kategorie,
                    action: entry.aktion,
                    prioritaet: entry.prioritaet
                };
            }
        } catch (regexErr) {
            console.warn(`⚠️  Ungültiges Regex-Pattern: ${entry.pattern}`, regexErr.message);
        }
    }

    return { blocked: false };
}

/**
 * Inhalte mit Blacklist-Prüfung validieren
 * @param {string} titel - Titel/Name des Inhalts
 * @param {string} beschreibung - Beschreibung/Text
 * @returns { valid: boolean, fehler?: string }
 */
async function validateContent(titel, beschreibung) {
    // Titel prüfen
    const titelCheck = await checkBlacklist(titel);
    if (titelCheck.blocked) {
        return {
            valid: false,
            fehler: `❌ Titel enthält nicht erlaubte Inhalte (${titelCheck.kategorie})`
        };
    }

    // Beschreibung prüfen
    const beschrCheck = await checkBlacklist(beschreibung);
    if (beschrCheck.blocked) {
        return {
            valid: false,
            fehler: `❌ Inhalt enthält nicht erlaubte Inhalte (${beschrCheck.kategorie})`
        };
    }

    // Flagged aber nicht blocked
    if (titelCheck.flagged || beschrCheck.flagged) {
        console.log(`⚠️  Inhalt wird als "${(titelCheck.kategorie || beschrCheck.kategorie)}" markiert`);
        return {
            valid: true,
            flagged: true,
            grund: titelCheck.grund || beschrCheck.grund
        };
    }

    return { valid: true };
}

/**
 * Admin-Funktion: Eintrag zur Blacklist hinzufügen
 */
async function addToBlacklist(pattern, typ, kategorie, prioritaet, aktion, beschreibung, admin_user) {
    try {
        await pool.query(`
            INSERT INTO gemeinschafts_blackliste 
            (pattern, typ, kategorie, prioritaet, aktion, beschreibung, erstellt_von)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [pattern, typ || 'phrase', kategorie, prioritaet || 0, aktion || 'block', beschreibung, admin_user]);

        blacklistCache = []; // Cache invalidieren
        console.log(`✅ Hinzugefügt zu Blacklist: "${pattern}"`);
        
        return { success: true };
    } catch (err) {
        console.error('❌ Fehler beim Hinzufügen zur Blacklist:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Admin-Funktion: Eintrag aus Blacklist entfernen
 */
async function removeFromBlacklist(id, admin_user) {
    try {
        const result = await pool.query(`
            UPDATE gemeinschafts_blackliste 
            SET ist_aktiv = FALSE, loeschgruende = 'Gelöscht durch: ' || $2
            WHERE id = $1
        `, [id, admin_user]);

        if (result.rowCount === 0) {
            return { success: false, fehler: 'Eintrag nicht gefunden' };
        }

        blacklistCache = []; // Cache invalidieren
        console.log(`✅ Entfernt aus Blacklist: ID ${id}`);
        
        return { success: true };
    } catch (err) {
        console.error('❌ Fehler beim Entfernen aus Blacklist:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Admin-Funktion: Alle Blacklist-Einträge abrufen
 */
async function getBlacklistAdmin() {
    try {
        const result = await pool.query(`
            SELECT id, pattern, typ, kategorie, prioritaet, aktion, beschreibung, 
                   ist_aktiv, erstellt_am, aktualisiert_am, erstellt_von
            FROM gemeinschafts_blackliste
            ORDER BY prioritaet DESC, kategorie, pattern
        `);
        return result.rows;
    } catch (err) {
        console.error('❌ Fehler beim Abrufen der Blacklist:', err.message);
        return [];
    }
}

module.exports = {
    checkBlacklist,
    validateContent,
    addToBlacklist,
    removeFromBlacklist,
    getBlacklistAdmin,
    getBlacklist
};
