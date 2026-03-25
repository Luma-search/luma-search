'use strict';

/**
 * HUB ROUTE
 * Datei: C:\Users\Felix\Desktop\Luma\Luma\server\routes\hub.js
 *
 * Einbindung in server.js — Session-Middleware in Variable auslagern:
 *
 *   const sessionMiddleware = session({ store: ..., secret: ..., ... });
 *   app.use(sessionMiddleware);
 *
 *   httpServer = app.listen(PORT, () => {
 *       ...
 *       require('./server/routes/hub').initHubSocket(httpServer, sessionMiddleware);
 *   });
 */

const { Server }                          = require('socket.io');
const { pool }                            = require('../../crawler_new/db.js');
const { checkIPBan, recordViolation }     = require('../../modules/community-moderation/ip-blocker.js');
const { validateContent, confirmContent } = require('../../modules/community-moderation/content-validator.js');

// ─── Konfiguration ─────────────────────────────────────────────────────────

const VERLAUF_LIMIT     = 50;
const NACHRICHTEN_LIMIT = 5;
const ZEITFENSTER_MS    = 10_000;
const HUB_KATEGORIE     = 'hub';

// ─── Rate-Limit ────────────────────────────────────────────────────────────

const _rateLimitMap = new Map();

function _rateLimitPruefen(socketId) {
    const jetzt       = Date.now();
    const zeitstempel = (_rateLimitMap.get(socketId) || [])
        .filter(t => jetzt - t < ZEITFENSTER_MS);
    if (zeitstempel.length >= NACHRICHTEN_LIMIT) return false;
    zeitstempel.push(jetzt);
    _rateLimitMap.set(socketId, zeitstempel);
    return true;
}

// ─── DB-Hilfsfunktionen ────────────────────────────────────────────────────

async function _listeIdFuerThema(thema) {
    const lesen = await pool.query(
        `SELECT id FROM community_listen
         WHERE LOWER(name) = LOWER($1) AND ist_versteckt = FALSE
         ORDER BY CASE WHEN kategorie != 'hub' THEN 0 ELSE 1 END, erstellt_am ASC
         LIMIT 1`,
        [thema]
    );
    if (lesen.rows.length > 0) return lesen.rows[0].id;

    const einfuegen = await pool.query(
        `INSERT INTO community_listen (name, beschreibung, erstellt_von, kategorie, tags)
         VALUES ($1, $2, 'system', $3, $4)
         ON CONFLICT DO NOTHING RETURNING id`,
        [thema, `Hub-Nachrichtenraum für das Thema "${thema}"`, HUB_KATEGORIE, [thema]]
    );
    if (einfuegen.rows.length > 0) return einfuegen.rows[0].id;

    const nochmal = await pool.query(
        `SELECT id FROM community_listen WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [thema]
    );
    return nochmal.rows[0].id;
}

/**
 * Lädt Nutzernamen aller blockierten Nutzer als Set<string>.
 * Gibt leeres Set zurück wenn nicht eingeloggt.
 * @param {number|null} userId
 * @returns {Promise<Set<string>>}
 */
async function _blockierteLaden(userId) {
    if (!userId) return new Set();
    try {
        const result = await pool.query(
            `SELECT n.benutzername
             FROM gemeinschafts_nutzer_blocker b
             JOIN nutzer n ON n.id = b.gesperrter_id::integer
             WHERE b.sperrer_id = $1::text`,
            [String(userId)]
        );
        return new Set(result.rows.map(r => r.benutzername.toLowerCase()));
    } catch (err) {
        console.error('❌ [HUB] _blockierteLaden Fehler:', err.message);
        return new Set();
    }
}

/**
 * Letzte N Nachrichten laden — blockierte Nutzer werden ausgefiltert.
 */
async function _verlaufLaden(listeId, blockierte = new Set()) {
    const ladeLimit = VERLAUF_LIMIT + blockierte.size * 5;
    const result = await pool.query(
        `SELECT id, nutzername, inhalt,
                erstellt_am AT TIME ZONE 'UTC' AS erstellt_am,
                is_solution
         FROM community_liste_eintraege
         WHERE liste_id = $1 AND ist_versteckt = FALSE
         ORDER BY erstellt_am DESC LIMIT $2`,
        [listeId, ladeLimit]
    );
    return result.rows
        .filter(row => !blockierte.has((row.nutzername || '').toLowerCase()))
        .slice(0, VERLAUF_LIMIT)
        .reverse()
        .map(row => ({
            ...row,
            erstellt_am: row.erstellt_am instanceof Date
                ? row.erstellt_am.toISOString()
                : String(row.erstellt_am),
        }));
}

async function _nachrichtSpeichern(listeId, nutzername, inhalt, ip) {
    const result = await pool.query(
        `INSERT INTO community_liste_eintraege
             (liste_id, inhalt, nutzername, erstellt_von_ip, ip_loeschfrist_am)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')
         RETURNING id, erstellt_am AT TIME ZONE 'UTC' AS erstellt_am`,
        [listeId, inhalt, nutzername, ip]
    );
    const row = result.rows[0];
    return {
        id:          row.id,
        erstellt_am: row.erstellt_am instanceof Date
            ? row.erstellt_am.toISOString()
            : String(row.erstellt_am),
    };
}

// ─── Socket.io ─────────────────────────────────────────────────────────────

/**
 * @param {import('http').Server} httpServer
 * @param {Function} sessionMiddleware — express-session Instanz
 */
function initHubSocket(httpServer, sessionMiddleware) {
    const io = new Server(httpServer, {
        cors: {
            origin:  process.env.FRONTEND_URL || '*',
            methods: ['GET', 'POST'],
        },
    });

    // Session in Socket.io verfügbar machen → socket.request.session.userId
    if (sessionMiddleware) {
        io.engine.use(sessionMiddleware);
    }

    io.on('connection', (socket) => {
        const ip = (
            socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
            || socket.handshake.address
            || 'unbekannt'
        ).substring(0, 50);

        const userId = socket.request?.session?.userId || null;

        let aktuellesThema  = null;
        let aktuelleListeId = null;
        let blockierte      = new Set();

        // ── JOIN_HUB ──────────────────────────────────────────────────────
        socket.on('join_hub', async (rohdaten) => {
            try {
                const thema = String(rohdaten?.thema || rohdaten || '')
                    .trim().toLowerCase().slice(0, 200);
                if (!thema) return;

                const sperre = await checkIPBan(ip);
                if (sperre.gebannt) {
                    socket.emit('hub_fehler', {
                        nachricht: sperre.permanent
                            ? 'Du wurdest dauerhaft gesperrt.'
                            : `Du bist noch ${sperre.restMinuten} Minute(n) gesperrt.`
                    });
                    return;
                }

                if (aktuellesThema) socket.leave(aktuellesThema);

                aktuellesThema  = thema;
                aktuelleListeId = await _listeIdFuerThema(thema);
                socket.join(thema);

                // Blockierte laden — nur für eingeloggte Nutzer
                blockierte = await _blockierteLaden(userId);

                const verlauf = await _verlaufLaden(aktuelleListeId, blockierte);
                socket.emit('hub_verlauf', verlauf);

                console.log(
                    `🔌 [HUB] ${userId ? `User#${userId}` : ip} → Room "${thema}" ` +
                    `(${verlauf.length} Nachrichten, ${blockierte.size} blockiert)`
                );

            } catch (fehler) {
                console.error('❌ [HUB] join_hub Fehler:', fehler.message);
                socket.emit('hub_verlauf', []);
            }
        });

        // ── LEAVE_HUB ─────────────────────────────────────────────────────
        socket.on('leave_hub', () => {
            if (aktuellesThema) {
                socket.leave(aktuellesThema);
                console.log(`🚪 [HUB] ${ip} hat Room "${aktuellesThema}" verlassen`);
                aktuellesThema  = null;
                aktuelleListeId = null;
                blockierte      = new Set();
            }
        });

        // ── HUB_NACHRICHT ─────────────────────────────────────────────────
        socket.on('hub_nachricht', async (rohdaten) => {
            try {
                const thema      = String(rohdaten?.thema || '').trim().toLowerCase().slice(0, 200);
                const nutzername = String(rohdaten?.nutzername || 'Anonym').trim().slice(0, 100) || 'Anonym';
                const inhalt     = String(rohdaten?.inhalt || '').trim();

                if (!thema || !inhalt) return;
                if (aktuellesThema !== thema || !aktuelleListeId) return;

                if (!_rateLimitPruefen(socket.id)) {
                    socket.emit('hub_fehler', { nachricht: 'Bitte nicht so schnell senden. Kurz warten.' });
                    return;
                }

                const sperre = await checkIPBan(ip);
                if (sperre.gebannt) {
                    socket.emit('hub_fehler', {
                        nachricht: sperre.permanent
                            ? 'Du wurdest dauerhaft gesperrt.'
                            : `Du bist noch ${sperre.restMinuten} Minute(n) gesperrt.`
                    });
                    return;
                }

                const pruefung = await validateContent(
                    { content: inhalt }, 'comment', `hub:${thema}`
                );
                if (!pruefung.ok) {
                    await recordViolation(ip, 'hub_inhalt', inhalt.substring(0, 100));
                    socket.emit('hub_fehler', { nachricht: pruefung.reason });
                    return;
                }

                let gespeichert;
                try {
                    gespeichert = await _nachrichtSpeichern(aktuelleListeId, nutzername, inhalt, ip);
                    confirmContent({ content: inhalt }, 'comment', `hub:${thema}`);
                } catch (dbFehler) {
                    console.error('❌ [HUB] Speichern fehlgeschlagen:', dbFehler.message);
                    socket.emit('hub_fehler', { nachricht: 'Nachricht konnte nicht gespeichert werden.' });
                    return;
                }

                // Broadcast an alle im Room —
                // eingeloggte Nutzer filtern blockierte Absender client-seitig
                io.to(thema).emit('neue_nachricht', {
                    id:          gespeichert.id,
                    nutzername,
                    inhalt,
                    erstellt_am: gespeichert.erstellt_am,
                    is_solution: false,
                });

                console.log(`💬 [HUB] "${thema}" @${nutzername}: ${inhalt.substring(0, 60)}${inhalt.length > 60 ? '…' : ''}`);

            } catch (fehler) {
                console.error('❌ [HUB] hub_nachricht Fehler:', fehler.message);
                socket.emit('hub_fehler', { nachricht: 'Ein unbekannter Fehler ist aufgetreten.' });
            }
        });

        // ── DISCONNECT ────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            _rateLimitMap.delete(socket.id);
            if (aktuellesThema) {
                console.log(`🔌 [HUB] ${ip} getrennt (war in Room "${aktuellesThema}")`);
            }
        });
    });

    console.log('🔌 [HUB] Socket.io bereit');
    return io;
}

module.exports = { initHubSocket };