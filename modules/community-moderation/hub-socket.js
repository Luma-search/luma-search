'use strict';

/**
 * HUB-SOCKET
 * Socket.io Echtzeit-Logik für den Social Hub.
 *
 * Strategie: Jedes Thema (z.B. "javascript") bekommt automatisch
 * eine Zeile in community_listen (wird beim ersten join_hub angelegt).
 * Nachrichten landen in community_liste_eintraege mit der thema_listen_id.
 *
 * Events (Client → Server):
 *   join_hub    { thema: string }
 *   leave_hub   (keine Daten)
 *   hub_nachricht { thema: string, nutzername: string, inhalt: string }
 *
 * Events (Server → Client):
 *   hub_verlauf     Array<NachrichtObjekt>   — letzte 50 beim Join
 *   neue_nachricht  NachrichtObjekt          — Broadcast an Room
 *   hub_fehler      { nachricht: string }    — Fehlermeldung nur an Sender
 */

const { pool }                                   = require('../../crawler_new/db.js');
const { checkIPBan, recordViolation }            = require('./ip-blocker.js');
const { validateContent, confirmContent }        = require('./content-validator.js');

// ─── Konfiguration ────────────────────────────────────────────────────────────

const VERLAUF_LIMIT     = 50;    // Nachrichten beim Join laden
const NACHRICHTEN_LIMIT = 5;     // Max. Nachrichten pro Nutzer in einem Zeitfenster
const ZEITFENSTER_MS    = 10_000; // Zeitfenster für Rate-Limit: 10 Sekunden
const HUB_KATEGORIE     = 'hub'; // Kategorie in community_listen

// ─── In-Memory Rate-Limit ────────────────────────────────────────────────────
// Map<socketId, timestamp[]>
const _rateLimitMap = new Map();

/**
 * Prüft ob ein Socket innerhalb des Zeitfensters zu viele Nachrichten gesendet hat.
 * Gibt true zurück wenn noch erlaubt, false wenn Rate-Limit überschritten.
 */
function _rateLimitPruefen(socketId) {
    const jetzt     = Date.now();
    const zeitstempel = (_rateLimitMap.get(socketId) || [])
        .filter(t => jetzt - t < ZEITFENSTER_MS);

    if (zeitstempel.length >= NACHRICHTEN_LIMIT) return false;

    zeitstempel.push(jetzt);
    _rateLimitMap.set(socketId, zeitstempel);
    return true;
}

// ─── DB-Hilfsfunktionen ──────────────────────────────────────────────────────

/**
 * Gibt die listen_id für ein Thema zurück.
 * Legt die Liste automatisch an falls sie noch nicht existiert.
 * @param {string} thema
 * @returns {Promise<number>} listen_id
 */
async function _listeIdFuerThema(thema) {
    // Erst versuchen zu lesen (schnellster Pfad)
    const leseErgebnis = await pool.query(
        `SELECT id FROM community_listen
         WHERE kategorie = $1 AND name = $2 AND ist_versteckt = FALSE
         LIMIT 1`,
        [HUB_KATEGORIE, thema]
    );

    if (leseErgebnis.rows.length > 0) {
        return leseErgebnis.rows[0].id;
    }

    // Noch nicht vorhanden → anlegen
    const einfuegeErgebnis = await pool.query(
        `INSERT INTO community_listen (name, beschreibung, erstellt_von, kategorie, tags)
         VALUES ($1, $2, 'system', $3, $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
            thema,
            `Hub-Nachrichtenraum für das Thema "${thema}"`,
            HUB_KATEGORIE,
            [thema],
        ]
    );

    if (einfuegeErgebnis.rows.length > 0) {
        return einfuegeErgebnis.rows[0].id;
    }

    // Gleichzeitig angelegt (Race Condition) → nochmal lesen
    const nochmalLesen = await pool.query(
        `SELECT id FROM community_listen
         WHERE kategorie = $1 AND name = $2
         LIMIT 1`,
        [HUB_KATEGORIE, thema]
    );
    return nochmalLesen.rows[0].id;
}

/**
 * Letzte N Nachrichten für eine Liste laden.
 * Gibt älteste zuerst zurück (chronologische Anzeige).
 * @param {number} listeId
 * @returns {Promise<Array>}
 */
async function _verlaufLaden(listeId) {
    const ergebnis = await pool.query(
        `SELECT
             id,
             nutzername,
             inhalt,
             erstellt_am,
             is_solution
         FROM community_liste_eintraege
         WHERE liste_id      = $1
           AND ist_versteckt = FALSE
         ORDER BY erstellt_am DESC
         LIMIT $2`,
        [listeId, VERLAUF_LIMIT]
    );
    return ergebnis.rows.reverse(); // älteste zuerst
}

/**
 * Nachricht in community_liste_eintraege speichern.
 * @param {number} listeId
 * @param {string} nutzername
 * @param {string} inhalt
 * @param {string} ip
 * @returns {Promise<{ id: number, erstellt_am: Date }>}
 */
async function _nachrichtSpeichern(listeId, nutzername, inhalt, ip) {
    const ergebnis = await pool.query(
        `INSERT INTO community_liste_eintraege
             (liste_id, inhalt, nutzername, erstellt_von_ip, ip_loeschfrist_am)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')
         RETURNING id, erstellt_am`,
        [listeId, inhalt, nutzername, ip]
    );
    return ergebnis.rows[0];
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────

/**
 * Registriert alle Socket.io-Events für den Social Hub.
 * Aufruf einmalig beim Serverstart: registerHubSocket(io)
 * @param {import('socket.io').Server} io
 */
function registerHubSocket(io) {

    io.on('connection', (socket) => {

        // IP-Adresse sicher extrahieren
        const ip = (
            socket.handshake.headers['x-forwarded-for']?.split(',')[0].trim()
            || socket.handshake.address
            || 'unbekannt'
        ).substring(0, 50);

        // Aktuelles Thema dieses Sockets (null = kein Room beigetreten)
        let aktuellesThema  = null;
        let aktuelleListeId = null;

        // ── JOIN_HUB ──────────────────────────────────────────────────────────
        socket.on('join_hub', async (rohdaten) => {
            try {
                const thema = String(rohdaten?.thema || rohdaten || '')
                    .trim()
                    .toLowerCase()
                    .slice(0, 200);

                if (!thema) return;

                // IP-Sperre prüfen
                const sperre = await checkIPBan(ip);
                if (sperre.gebannt) {
                    const restText = sperre.permanent
                        ? 'Du wurdest dauerhaft gesperrt.'
                        : `Du bist noch ${sperre.restMinuten} Minute(n) gesperrt.`;
                    socket.emit('hub_fehler', { nachricht: restText });
                    return;
                }

                // Vorherigen Room verlassen
                if (aktuellesThema) {
                    socket.leave(aktuellesThema);
                }

                // Neuen Room beitreten
                aktuellesThema  = thema;
                aktuelleListeId = await _listeIdFuerThema(thema);
                socket.join(thema);

                // Verlauf senden
                const verlauf = await _verlaufLaden(aktuelleListeId);
                socket.emit('hub_verlauf', verlauf);

                console.log(`🔌 [HUB] ${ip} ist Room "${thema}" beigetreten (${verlauf.length} Nachrichten geladen)`);

            } catch (fehler) {
                console.error('❌ [HUB] join_hub Fehler:', fehler.message);
                socket.emit('hub_verlauf', []);
            }
        });

        // ── LEAVE_HUB ─────────────────────────────────────────────────────────
        socket.on('leave_hub', () => {
            if (aktuellesThema) {
                socket.leave(aktuellesThema);
                console.log(`🚪 [HUB] ${ip} hat Room "${aktuellesThema}" verlassen`);
                aktuellesThema  = null;
                aktuelleListeId = null;
            }
        });

        // ── HUB_NACHRICHT ─────────────────────────────────────────────────────
        socket.on('hub_nachricht', async (rohdaten) => {
            try {
                const thema      = String(rohdaten?.thema || '')
                    .trim().toLowerCase().slice(0, 200);
                const nutzername = String(rohdaten?.nutzername || 'Anonym')
                    .trim().slice(0, 100) || 'Anonym';
                const inhalt     = String(rohdaten?.inhalt || '').trim();

                if (!thema || !inhalt) return;

                // Socket muss im richtigen Room sein
                if (aktuellesThema !== thema || !aktuelleListeId) return;

                // Rate-Limit prüfen
                if (!_rateLimitPruefen(socket.id)) {
                    socket.emit('hub_fehler', {
                        nachricht: 'Bitte nicht so schnell senden. Kurz warten.'
                    });
                    return;
                }

                // IP-Sperre prüfen
                const sperre = await checkIPBan(ip);
                if (sperre.gebannt) {
                    const restText = sperre.permanent
                        ? 'Du wurdest dauerhaft gesperrt.'
                        : `Du bist noch ${sperre.restMinuten} Minute(n) gesperrt.`;
                    socket.emit('hub_fehler', { nachricht: restText });
                    return;
                }

                // Inhalts-Moderation (deine bestehende Pipeline)
                const pruefung = await validateContent(
                    { content: inhalt },
                    'comment',
                    `hub:${thema}`
                );

                if (!pruefung.ok) {
                    // Verstoß aufzeichnen → zählt ggf. zur Auto-Sperre
                    await recordViolation(ip, 'hub_inhalt', inhalt.substring(0, 100));
                    socket.emit('hub_fehler', { nachricht: pruefung.reason });
                    return;
                }

                // In DB speichern
                let gespeichert;
                try {
                    gespeichert = await _nachrichtSpeichern(
                        aktuelleListeId,
                        nutzername,
                        inhalt,
                        ip
                    );
                    // Duplikat-Cache nach erfolgreichem Speichern aktualisieren
                    confirmContent({ content: inhalt }, 'comment', `hub:${thema}`);
                } catch (dbFehler) {
                    console.error('❌ [HUB] Speichern fehlgeschlagen:', dbFehler.message);
                    socket.emit('hub_fehler', {
                        nachricht: 'Nachricht konnte nicht gespeichert werden.'
                    });
                    return;
                }

                // Nachrichtenobjekt zusammenstellen
                const nachricht = {
                    id:          gespeichert.id,
                    nutzername,
                    inhalt,
                    erstellt_am: gespeichert.erstellt_am,
                    is_solution: false,
                };

                // An alle im Room broadcasten (einschließlich Sender)
                io.to(thema).emit('neue_nachricht', nachricht);

                console.log(
                    `💬 [HUB] "${thema}" von @${nutzername}: ` +
                    `${inhalt.substring(0, 60)}${inhalt.length > 60 ? '…' : ''}`
                );

            } catch (fehler) {
                console.error('❌ [HUB] hub_nachricht Fehler:', fehler.message);
                socket.emit('hub_fehler', {
                    nachricht: 'Ein unbekannter Fehler ist aufgetreten.'
                });
            }
        });

        // ── DISCONNECT ────────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            _rateLimitMap.delete(socket.id);
            if (aktuellesThema) {
                console.log(`🔌 [HUB] ${ip} getrennt (war in Room "${aktuellesThema}")`);
            }
        });
    });
}

module.exports = { registerHubSocket };