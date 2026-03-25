/**
 * ADMIN AUTH MIDDLEWARE
 * Schützt alle /api/admin/* Routen vor unbefugtem Zugriff.
 *
 * ── Ordner-Struktur ──────────────────────────────────────
 *  Luma/
 *  ├── middleware/
 *  │   └── admin-auth.js        ← DIESE DATEI
 *  ├── modules/
 *  ├── navigations_tabs/
 *  └── ...
 *
 * ── Verwendung in community.js ───────────────────────────
 *  const { requireAdmin } = require('../../middleware/admin-auth');
 *
 *  // Einzelne Route absichern:
 *  router.get('/api/admin/blacklist', requireAdmin, async (req, res) => { ... });
 *
 * ── .env Konfiguration ───────────────────────────────────
 *  ADMIN_SECRET=dein-geheimer-token      ← Bearer-Token für direkte API-Calls
 *  ADMIN_USERNAMES=felix,admin           ← Komma-getrennte Session-User Whitelist
 */

'use strict';

// ─── Konfiguration aus .env ───────────────────────────────────────────────────

/**
 * Whitelist erlaubter Admin-Usernames (aus .env ADMIN_USERNAMES=felix,admin)
 * Leer = alle eingeloggten User sind Admins (nur für Entwicklung!)
 */
const ADMIN_WHITELIST = (process.env.ADMIN_USERNAMES || '')
    .split(',')
    .map(u => u.trim().toLowerCase())
    .filter(Boolean);

/**
 * Statischer Bearer-Token für API-Zugriff ohne Session.
 * (aus .env ADMIN_SECRET=mein-token-123)
 */
const ADMIN_SECRET = process.env.ADMIN_SECRET || null;

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function _extractBearerToken(req) {
    const auth = req.headers['authorization'] || '';
    return auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
}

function _getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0].trim()
        || req.ip
        || req.socket?.remoteAddress
        || 'unknown';
}

function _isWhitelisted(username) {
    if (ADMIN_WHITELIST.length === 0) return true; // Dev-Modus: alle erlaubt
    return ADMIN_WHITELIST.includes(username.toLowerCase());
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

/**
 * requireAdmin — Express-Middleware
 *
 * Prüft in dieser Reihenfolge:
 *  1. Bearer-Token im Authorization-Header  (ADMIN_SECRET aus .env)
 *  2. Session-User (req.user oder req.session.user) mit Whitelist-Check
 *
 * Bei Erfolg: setzt req.adminUser = username, ruft next() auf.
 * Bei Fehler: 401 (nicht eingeloggt) oder 403 (kein Admin).
 */
function requireAdmin(req, res, next) {

    // ── 1. Bearer-Token ───────────────────────────────────────────────────────
    if (ADMIN_SECRET) {
        const token = _extractBearerToken(req);
        if (token) {
            if (token === ADMIN_SECRET) {
                req.adminUser = req.user?.username || 'api-admin';
                console.log(`🔑 [AdminAuth] Token OK: ${req.adminUser} → ${req.method} ${req.path}`);
                return next();
            }
            // Token vorhanden aber falsch → sofort abweisen
            console.warn(`🚫 [AdminAuth] Falscher Token von ${_getClientIP(req)}`);
            return res.status(401).json({ error: 'Ungültiger Admin-Token.' });
        }
    }

    // ── 2. Session-User ───────────────────────────────────────────────────────
    const username = req.user?.username || req.session?.user?.username;

    if (!username) {
        console.warn(`🚫 [AdminAuth] Kein User → ${req.method} ${req.path} (${_getClientIP(req)})`);
        return res.status(401).json({ error: 'Nicht eingeloggt.' });
    }

    if (!_isWhitelisted(username)) {
        console.warn(`🚫 [AdminAuth] "${username}" ist kein Admin → ${req.method} ${req.path}`);
        return res.status(403).json({ error: 'Zugriff verweigert. Nur Admins haben Zugriff.' });
    }

    req.adminUser = username;
    console.log(`✅ [AdminAuth] ${username} → ${req.method} ${req.path}`);
    next();
}

module.exports = { requireAdmin };