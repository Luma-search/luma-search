/**
 * LUMA Auth Manager
 * Nutzer-Registrierung, Login, persönliche URL-Blacklist
 */

const bcrypt = require('bcryptjs');
const { pool } = require('../crawler_new/db.js');

// ── Nutzer anlegen ──────────────────────────────────────────
async function createUser(benutzername, email, password) {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
        `INSERT INTO nutzer (benutzername, passwort_hash, email)
         VALUES ($1, $2, $3)
         RETURNING id, benutzername, email, erstellt_am`,
        [benutzername.trim(), hash, email.toLowerCase().trim()]
    );
    return result.rows[0];
}

// ── Nutzer per E-Mail suchen ────────────────────────────────
async function findUserByEmail(email) {
    const result = await pool.query(
        `SELECT * FROM nutzer WHERE email = $1`,
        [email.toLowerCase().trim()]
    );
    return result.rows[0] || null;
}

// ── Passwort prüfen ─────────────────────────────────────────
async function verifyPassword(plain, hash) {
    return bcrypt.compare(plain, hash);
}

// ── Nutzer per ID laden (für Session-Restore) ───────────────
async function findUserById(id) {
    const result = await pool.query(
        `SELECT id, benutzername, email, erstellt_am FROM nutzer WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

// ── Blacklist lesen ─────────────────────────────────────────
async function getBlacklist(userId) {
    const result = await pool.query(
        `SELECT id, url_muster
         FROM nutzer_url_blacklist
         WHERE nutzer_id = $1
         ORDER BY id DESC`,
        [userId]
    );
    return result.rows;
}

// ── URL zur Blacklist hinzufügen ────────────────────────────
async function addToBlacklist(userId, url) {
    const urlTrimmed = url.trim();
    // Duplikat-Prüfung (kein UNIQUE-Constraint in der neuen Tabelle)
    const existing = await pool.query(
        `SELECT id FROM nutzer_url_blacklist WHERE nutzer_id = $1 AND url_muster = $2`,
        [userId, urlTrimmed]
    );
    if (existing.rowCount > 0) return null; // bereits vorhanden

    const result = await pool.query(
        `INSERT INTO nutzer_url_blacklist (nutzer_id, url_muster)
         VALUES ($1, $2)
         RETURNING id, url_muster`,
        [userId, urlTrimmed]
    );
    return result.rows[0] || null;
}

// ── URL aus Blacklist entfernen ─────────────────────────────
async function removeFromBlacklist(userId, entryId) {
    const result = await pool.query(
        `DELETE FROM nutzer_url_blacklist
         WHERE id = $1 AND nutzer_id = $2
         RETURNING id`,
        [entryId, userId]
    );
    return result.rowCount > 0;
}

// ── Prüfen ob URL für Nutzer gesperrt ist ───────────────────
async function isBlacklisted(userId, url) {
    const result = await pool.query(
        `SELECT 1 FROM nutzer_url_blacklist
         WHERE nutzer_id = $1 AND url_muster = $2
         LIMIT 1`,
        [userId, url.trim()]
    );
    return result.rowCount > 0;
}

// ── Whitelist lesen ──────────────────────────────────────────
async function getWhitelist(userId) {
    const result = await pool.query(
        `SELECT id, url_muster, erstellt_am
         FROM nutzer_url_whitelist
         WHERE nutzer_id = $1
         ORDER BY id DESC`,
        [userId]
    );
    return result.rows;
}

// ── Domain zur Whitelist hinzufügen ─────────────────────────
async function addToWhitelist(userId, url) {
    const urlTrimmed = url.trim();
    const existing = await pool.query(
        `SELECT id FROM nutzer_url_whitelist WHERE nutzer_id = $1 AND url_muster = $2`,
        [userId, urlTrimmed]
    );
    if (existing.rowCount > 0) return null;

    const result = await pool.query(
        `INSERT INTO nutzer_url_whitelist (nutzer_id, url_muster)
         VALUES ($1, $2)
         RETURNING id, url_muster, erstellt_am`,
        [userId, urlTrimmed]
    );
    return result.rows[0] || null;
}

// ── Domain aus Whitelist entfernen ───────────────────────────
async function removeFromWhitelist(userId, entryId) {
    const result = await pool.query(
        `DELETE FROM nutzer_url_whitelist
         WHERE id = $1 AND nutzer_id = $2
         RETURNING id`,
        [entryId, userId]
    );
    return result.rowCount > 0;
}

module.exports = {
    createUser,
    findUserByEmail,
    verifyPassword,
    findUserById,
    getBlacklist,
    addToBlacklist,
    removeFromBlacklist,
    isBlacklisted,
    getWhitelist,
    addToWhitelist,
    removeFromWhitelist
};
