/**
 * IP-BLOCKER
 * Sperrt wiederholende Störer automatisch.
 *
 * Verwendet Tabelle: gemeinschafts_ip_sperren
 *
 * Funktionsweise:
 *  - Jede blockierte Aktion → Verstoß wird gezählt
 *  - Ab 3 Verstößen in 1 Stunde   → 1 Stunde gesperrt
 *  - Ab 5 Verstößen in 24 Stunden → 24 Stunden gesperrt
 *  - Ab 10 Verstößen gesamt        → 7 Tage gesperrt
 *  - Manuell durch Admin           → permanent bis Admin aufhebt
 *
 * Verwendung in community.js:
 *  const { checkIPBan, recordViolation, requireNotBanned } = require('./ip-blocker');
 *
 *  // Als Middleware (einfachste Variante):
 *  router.post('/api/community-lists', requireNotBanned, apiLimiter, async (req, res) => { ... });
 *
 *  // Nach jeder blockierten Aktion:
 *  await recordViolation(clientIP, 'beleidigung', 'du Arschloch');
 */

'use strict';

const { pool } = require('../../crawler_new/db.js');

// ─── Konfiguration ────────────────────────────────────────────────────────────

const CONFIG = {
    // Ab wie vielen Verstößen wird gesperrt?
    stufe1_verstösse:  3,          // 3 Verstöße → 1 Stunde Sperre
    stufe1_fenster_ms: 60 * 60 * 1000,       // innerhalb von 1 Stunde
    stufe1_dauer_ms:   60 * 60 * 1000,       // Sperre: 1 Stunde

    stufe2_verstösse:  5,          // 5 Verstöße → 24h Sperre
    stufe2_fenster_ms: 24 * 60 * 60 * 1000,  // innerhalb von 24 Stunden
    stufe2_dauer_ms:   24 * 60 * 60 * 1000,  // Sperre: 24 Stunden

    stufe3_verstösse:  10,         // 10 Verstöße gesamt → 7 Tage Sperre
    stufe3_dauer_ms:   7 * 24 * 60 * 60 * 1000, // Sperre: 7 Tage
};

// ─── In-Memory Cache (verhindert DB-Hit bei jeder Anfrage) ────────────────────
const _banCache    = new Map(); // ip → { gesperrt_bis: Date, grund: string }
const CACHE_TTL_MS = 60 * 1000; // 1 Minute Cache

function _getCached(ip) {
    const entry = _banCache.get(ip);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) { _banCache.delete(ip); return null; }
    return entry;
}

function _setCache(ip, gesperrt_bis, grund, stufe) {
    _banCache.set(ip, { gesperrt_bis, grund, stufe, ts: Date.now() });
}

function _clearCache(ip) {
    _banCache.delete(ip);
}

// ─── IP-Adresse sauber extrahieren ───────────────────────────────────────────

function extractIP(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0].trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

// ─── HAUPTFUNKTION: Ist diese IP gesperrt? ────────────────────────────────────

/**
 * Prüft ob eine IP aktuell gesperrt ist.
 *
 * @param {string} ip
 * @returns {Promise<{
 *   gebannt: boolean,
 *   grund:   string|null,
 *   stufe:   number|null,
 *   bis:     Date|null,
 *   restMinuten: number
 * }>}
 */
async function checkIPBan(ip) {
    if (!ip || ip === 'unknown') return { gebannt: false };

    // Cache prüfen
    const cached = _getCached(ip);
    if (cached !== null) {
        if (!cached.gesperrt_bis) return { gebannt: false };
        const jetzt = new Date();
        if (cached.gesperrt_bis > jetzt) {
            const restMs = cached.gesperrt_bis - jetzt;
            return {
                gebannt:     true,
                grund:       cached.grund,
                stufe:       cached.stufe,
                bis:         cached.gesperrt_bis,
                restMinuten: Math.ceil(restMs / 60000),
            };
        }
        _clearCache(ip);
        return { gebannt: false };
    }

    // DB prüfen
    try {
        const result = await pool.query(`
            SELECT id, grund, stufe, gesperrt_bis, ist_permanent
            FROM gemeinschafts_ip_sperren
            WHERE ip_adresse = $1
              AND ist_aktiv = TRUE
              AND (ist_permanent = TRUE OR gesperrt_bis > NOW())
            ORDER BY gesperrt_bis DESC NULLS FIRST
            LIMIT 1
        `, [ip]);

        if (result.rows.length === 0) {
            _setCache(ip, null, null, null);
            return { gebannt: false };
        }

        const row         = result.rows[0];
        const gesperrt_bis = row.ist_permanent ? new Date('2099-01-01') : new Date(row.gesperrt_bis);
        const jetzt       = new Date();

        if (!row.ist_permanent && gesperrt_bis <= jetzt) {
            _clearCache(ip);
            return { gebannt: false };
        }

        const restMs = gesperrt_bis - jetzt;
        _setCache(ip, gesperrt_bis, row.grund, row.stufe);

        console.log(`🚫 [IP-BAN] ${ip} gesperrt bis ${gesperrt_bis.toLocaleString('de-DE')} | Grund: ${row.grund}`);

        return {
            gebannt:     true,
            grund:       row.grund,
            stufe:       row.stufe,
            bis:         row.ist_permanent ? null : gesperrt_bis,
            restMinuten: row.ist_permanent ? null : Math.ceil(restMs / 60000),
            permanent:   row.ist_permanent || false,
        };

    } catch (err) {
        console.error('❌ [IP-BAN] checkIPBan Fehler:', err.message);
        return { gebannt: false }; // Im Fehlerfall nicht blockieren
    }
}

// ─── VERSTOSS AUFZEICHNEN & Auto-Sperre auslösen ───────────────────────────────

/**
 * Zeichnet einen Verstoß auf und sperrt die IP automatisch wenn nötig.
 *
 * @param {string} ip
 * @param {string} verstossTyp  — z.B. 'beleidigung', 'drohung', 'spam'
 * @param {string} [textSnippet] — kurzer Auszug des blockierten Texts (max 100 Zeichen)
 */
async function recordViolation(ip, verstossTyp, textSnippet = '') {
    if (!ip || ip === 'unknown') return;

    const snippet = String(textSnippet).substring(0, 100);

    try {
        // Verstoß in DB eintragen
        await pool.query(`
            INSERT INTO gemeinschafts_ip_sperren
                (ip_adresse, grund, verstoss_typ, letzter_verstoss_text, verstoss_anzahl,
                 ist_aktiv, ist_permanent, gesperrt_bis, stufe)
            VALUES ($1, $2, $3, $4, 1, FALSE, FALSE, NULL, 0)
            ON CONFLICT (ip_adresse) DO UPDATE
            SET verstoss_anzahl      = gemeinschafts_ip_sperren.verstoss_anzahl + 1,
                letzter_verstoss_text = EXCLUDED.letzter_verstoss_text,
                letzter_verstoss_am  = NOW(),
                verstoss_typ         = EXCLUDED.verstoss_typ,
                verstoss_timestamps  = (ARRAY[NOW()]::TIMESTAMPTZ[] || COALESCE(gemeinschafts_ip_sperren.verstoss_timestamps, ARRAY[]::TIMESTAMPTZ[]))[1:100]
        `, [ip, verstossTyp, verstossTyp, snippet]);

        // // Aktuelle Verstoss-Zaehler korrekt aus Timestamp-Array zaehlen
        const stats = await pool.query(`
            SELECT
                verstoss_anzahl,
                (SELECT COUNT(*) FROM unnest(COALESCE(verstoss_timestamps, ARRAY[]::TIMESTAMPTZ[])) AS t
                 WHERE t > NOW() - INTERVAL '1 hour') AS verstaesse_1h,
                (SELECT COUNT(*) FROM unnest(COALESCE(verstoss_timestamps, ARRAY[]::TIMESTAMPTZ[])) AS t
                 WHERE t > NOW() - INTERVAL '24 hours') AS verstaesse_24h
            FROM gemeinschafts_ip_sperren
            WHERE ip_adresse = $1
        `, [ip]);

        if (stats.rows.length === 0) return;

        const { verstoss_anzahl, verstaesse_1h, verstaesse_24h } = stats.rows[0];
        const gesamt = parseInt(verstoss_anzahl) || 0;
        const stunde = parseInt(verstaesse_1h) || 0;
        const tag    = parseInt(verstaesse_24h) || 0;

        // Auto-Sperre berechnen
        let sperreMs  = null;
        let stufe     = 0;
        let banGrund  = verstossTyp;

        if (gesamt >= CONFIG.stufe3_verstösse) {
            sperreMs = CONFIG.stufe3_dauer_ms;
            stufe    = 3;
            banGrund = `${gesamt} Verstöße insgesamt (${verstossTyp})`;
        } else if (tag >= CONFIG.stufe2_verstösse) {
            sperreMs = CONFIG.stufe2_dauer_ms;
            stufe    = 2;
            banGrund = `${tag} Verstöße in 24h (${verstossTyp})`;
        } else if (stunde >= CONFIG.stufe1_verstösse) {
            sperreMs = CONFIG.stufe1_dauer_ms;
            stufe    = 1;
            banGrund = `${stunde} Verstöße in 1h (${verstossTyp})`;
        }

        if (sperreMs) {
            const gesperrt_bis = new Date(Date.now() + sperreMs);

            await pool.query(`
                UPDATE gemeinschafts_ip_sperren
                SET ist_aktiv   = TRUE,
                    gesperrt_bis = $2,
                    stufe       = $3,
                    grund       = $4,
                    gesperrt_am = NOW()
                WHERE ip_adresse = $1
            `, [ip, gesperrt_bis, stufe, banGrund]);

            _clearCache(ip); // Cache leeren damit nächster Check aus DB liest

            console.log(
                `🔒 [IP-BAN] Auto-Sperre Stufe ${stufe}: ${ip} | ` +
                `bis ${gesperrt_bis.toLocaleString('de-DE')} | ${banGrund}`
            );
        }

    } catch (err) {
        console.error('❌ [IP-BAN] recordViolation Fehler:', err.message);
    }
}

// ─── EXPRESS MIDDLEWARE ───────────────────────────────────────────────────────

/**
 * requireNotBanned — Express-Middleware
 * Prüft ob die IP gesperrt ist, bevor die Route ausgeführt wird.
 * Einfach vor apiLimiter in die Route einbauen.
 */
async function requireNotBanned(req, res, next) {
    const ip     = extractIP(req);
    const result = await checkIPBan(ip);

    if (result.gebannt) {
        const msg = result.permanent
            ? 'Du wurdest dauerhaft gesperrt.'
            : `Du bist noch ${result.restMinuten} Minute(n) gesperrt. Grund: ${result.grund}`;

        return res.status(429).json({
            error:       'Zugriff gesperrt',
            message:     msg,
            restMinuten: result.restMinuten ?? null,
            bis:         result.bis?.toISOString() ?? null,
        });
    }

    next();
}

// ─── ADMIN-FUNKTIONEN ─────────────────────────────────────────────────────────

/**
 * Manuelle Sperre durch Admin.
 * @param {string} ip
 * @param {string} grund
 * @param {boolean} permanent
 * @param {number} [stundenDauer]  — ignoriert wenn permanent=true
 * @param {string} admin
 */
async function banIPManual(ip, grund, permanent = false, stundenDauer = 24, admin) {
    try {
        const gesperrt_bis = permanent
            ? null
            : new Date(Date.now() + stundenDauer * 60 * 60 * 1000);

        await pool.query(`
            INSERT INTO gemeinschafts_ip_sperren
                (ip_adresse, grund, verstoss_typ, ist_aktiv, ist_permanent, gesperrt_bis, stufe, gesperrt_von)
            VALUES ($1, $2, 'manuell', TRUE, $3, $4, 99, $5)
            ON CONFLICT (ip_adresse) DO UPDATE
            SET ist_aktiv    = TRUE,
                ist_permanent = $3,
                gesperrt_bis  = $4,
                grund        = $2,
                stufe        = 99,
                gesperrt_von = $5,
                gesperrt_am  = NOW()
        `, [ip, grund, permanent, gesperrt_bis, admin]);

        _clearCache(ip);
        console.log(`🔒 [IP-BAN] Manuell gesperrt: ${ip} | ${permanent ? 'permanent' : stundenDauer + 'h'} | ${grund}`);

        return { success: true };
    } catch (err) {
        console.error('❌ [IP-BAN] banIPManual Fehler:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Sperre aufheben durch Admin.
 */
async function unbanIP(ip, admin) {
    try {
        await pool.query(`
            UPDATE gemeinschafts_ip_sperren
            SET ist_aktiv    = FALSE,
                ist_permanent = FALSE,
                gesperrt_bis  = NULL,
                aufgehoben_von = $2,
                aufgehoben_am  = NOW()
            WHERE ip_adresse = $1
        `, [ip, admin]);

        _clearCache(ip);
        console.log(`✅ [IP-BAN] Sperre aufgehoben: ${ip} von Admin: ${admin}`);

        return { success: true };
    } catch (err) {
        console.error('❌ [IP-BAN] unbanIP Fehler:', err.message);
        return { success: false, fehler: err.message };
    }
}

/**
 * Alle aktiven Sperren abrufen (für Admin-Dashboard).
 */
async function getActiveBans() {
    try {
        const result = await pool.query(`
            SELECT
                ip_adresse, grund, stufe, verstoss_anzahl,
                gesperrt_bis, ist_permanent, gesperrt_am,
                letzter_verstoss_text, verstoss_typ, gesperrt_von
            FROM gemeinschafts_ip_sperren
            WHERE ist_aktiv = TRUE
              AND (ist_permanent = TRUE OR gesperrt_bis > NOW())
            ORDER BY gesperrt_am DESC
            LIMIT 100
        `);
        return result.rows;
    } catch (err) {
        console.error('❌ [IP-BAN] getActiveBans Fehler:', err.message);
        return [];
    }
}

/**
 * Verstoß-Historie einer IP abrufen.
 */
async function getIPHistory(ip) {
    try {
        const result = await pool.query(`
            SELECT
                ip_adresse, grund, stufe, verstoss_anzahl,
                gesperrt_bis, ist_permanent, ist_aktiv,
                gesperrt_am, letzter_verstoss_am,
                letzter_verstoss_text, verstoss_typ
            FROM gemeinschafts_ip_sperren
            WHERE ip_adresse = $1
            ORDER BY gesperrt_am DESC NULLS LAST
        `, [ip]);
        return result.rows;
    } catch (err) {
        console.error('❌ [IP-BAN] getIPHistory Fehler:', err.message);
        return [];
    }
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

module.exports = {
    checkIPBan,
    recordViolation,
    requireNotBanned,
    banIPManual,
    unbanIP,
    getActiveBans,
    getIPHistory,
    extractIP,
};