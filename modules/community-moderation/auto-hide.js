/**
 * AUTO-HIDE
 * Versteckt Inhalte automatisch wenn genug Nutzer sie gemeldet haben.
 *
 * Ablauf:
 *  1. Nutzer meldet einen Inhalt → POST /api/community-reports
 *  2. DB-Trigger zählt Meldungen automatisch hoch
 *  3. Ab 3 Meldungen → ist_versteckt = TRUE (Trigger macht das selbst)
 *  4. Inhalt verschwindet für alle Nutzer
 *  5. Admin sieht ihn in der Moderations-Queue und entscheidet:
 *     → Freigeben (war doch OK)
 *     → Löschen   (war wirklich schlecht)
 *     → Ignorieren (Report war unbegründet)
 *
 * Versteckte Inhalte werden in:
 *  - GET /api/community-lists          → gefiltert (nicht angezeigt)
 *  - GET /api/community-lists/:id      → Items gefiltert
 *  - GET /api/admin/moderation-queue   → für Admin sichtbar
 */

'use strict';

const { pool } = require('../../crawler_new/db.js');

// ─── Schwellenwert ────────────────────────────────────────────────────────────
// Ab wie vielen Meldungen wird ein Inhalt versteckt?
// (Wird auch im SQL-Trigger gesetzt — beide müssen übereinstimmen!)
const MELDUNGEN_SCHWELLENWERT = 3;

// ─── ADMIN: Moderations-Queue ─────────────────────────────────────────────────

/**
 * Alle versteckten Inhalte abrufen — für Admin-Dashboard.
 * Gibt Listen UND Einträge zusammen zurück, neueste zuerst.
 */
async function getModerationQueue() {
    try {
        // Versteckte Listen
        const listenResult = await pool.query(`
            SELECT
                'liste'             AS typ,
                cl.id,
                cl.name             AS titel,
                cl.beschreibung     AS inhalt,
                cl.erstellt_von     AS nutzername,
                cl.meldungen_anzahl,
                cl.versteckt_am,
                cl.versteckt_grund,
                cl.erstellt_von_ip  AS ip_adresse,
                (
                    SELECT STRING_AGG(DISTINCT grund, ', ')
                    FROM gemeinschafts_meldungen
                    WHERE meldungstyp = 'liste' AND ziel_id = cl.id
                ) AS meldungsgruende
            FROM community_listen cl
            WHERE cl.ist_versteckt = TRUE
              AND cl.freigegeben_von IS NULL
            ORDER BY cl.versteckt_am DESC
        `);

        // Versteckte Einträge
        const eintraegeResult = await pool.query(`
            SELECT
                'eintrag'           AS typ,
                ce.id,
                NULL                AS titel,
                ce.inhalt,
                ce.nutzername,
                ce.meldungen_anzahl,
                ce.versteckt_am,
                ce.versteckt_grund,
                ce.erstellt_von_ip  AS ip_adresse,
                (
                    SELECT STRING_AGG(DISTINCT grund, ', ')
                    FROM gemeinschafts_meldungen
                    WHERE meldungstyp = 'eintrag' AND ziel_id = ce.id
                ) AS meldungsgruende
            FROM community_liste_eintraege ce
            WHERE ce.ist_versteckt = TRUE
              AND ce.freigegeben_von IS NULL
            ORDER BY ce.versteckt_am DESC
        `);

        return {
            listen:    listenResult.rows,
            eintraege: eintraegeResult.rows,
            gesamt:    listenResult.rows.length + eintraegeResult.rows.length,
        };
    } catch (err) {
        console.error('❌ [AutoHide] getModerationQueue Fehler:', err.message);
        return { listen: [], eintraege: [], gesamt: 0 };
    }
}

// ─── ADMIN: Freigeben ─────────────────────────────────────────────────────────

/**
 * Inhalt freigeben — war doch OK, wieder sichtbar machen.
 * @param {'liste'|'eintrag'} typ
 * @param {number} id
 * @param {string} admin
 */
async function freigebenInhalt(typ, id, admin) {
    const tabelle = typ === 'liste' ? 'community_listen' : 'community_liste_eintraege';

    try {
        const result = await pool.query(`
            UPDATE ${tabelle}
            SET ist_versteckt  = FALSE,
                freigegeben_von = $2,
                freigegeben_am  = NOW(),
                versteckt_grund = NULL
            WHERE id = $1
            RETURNING id
        `, [id, admin]);

        if (result.rowCount === 0) {
            return { success: false, fehler: 'Inhalt nicht gefunden.' };
        }

        // Meldungen als bearbeitet markieren
        await pool.query(`
            UPDATE gemeinschafts_meldungen
            SET bearbeitet_von      = $1,
                bearbeitet_am       = NOW(),
                bearbeitungs_aktion = 'freigeben'
            WHERE meldungstyp = $2 AND ziel_id = $3
        `, [admin, typ, id]);

        console.log(`✅ [AutoHide] ${typ} #${id} freigegeben von ${admin}`);
        return { success: true };
    } catch (err) {
        console.error('❌ [AutoHide] freigebenInhalt Fehler:', err.message);
        return { success: false, fehler: err.message };
    }
}

// ─── ADMIN: Löschen ───────────────────────────────────────────────────────────

/**
 * Inhalt endgültig löschen — war wirklich regelwidrig.
 * @param {'liste'|'eintrag'} typ
 * @param {number} id
 * @param {string} admin
 */
async function löschenInhalt(typ, id, admin) {
    const tabelle = typ === 'liste' ? 'community_listen' : 'community_liste_eintraege';

    try {
        // Meldungen zuerst als bearbeitet markieren
        await pool.query(`
            UPDATE gemeinschafts_meldungen
            SET bearbeitet_von      = $1,
                bearbeitet_am       = NOW(),
                bearbeitungs_aktion = 'loeschen'
            WHERE meldungstyp = $2 AND ziel_id = $3
        `, [admin, typ, id]);

        // Inhalt löschen
        const result = await pool.query(
            `DELETE FROM ${tabelle} WHERE id = $1 RETURNING id`,
            [id]
        );

        if (result.rowCount === 0) {
            return { success: false, fehler: 'Inhalt nicht gefunden.' };
        }

        console.log(`🗑️  [AutoHide] ${typ} #${id} gelöscht von ${admin}`);
        return { success: true };
    } catch (err) {
        console.error('❌ [AutoHide] löschenInhalt Fehler:', err.message);
        return { success: false, fehler: err.message };
    }
}

// ─── ADMIN: Meldungen ignorieren ──────────────────────────────────────────────

/**
 * Meldungen als unbegründet markieren — Inhalt wieder sichtbar.
 */
async function ignorierenMeldungen(typ, id, admin) {
    const tabelle = typ === 'liste' ? 'community_listen' : 'community_liste_eintraege';

    try {
        await pool.query(`
            UPDATE ${tabelle}
            SET ist_versteckt   = FALSE,
                freigegeben_von = $2,
                freigegeben_am  = NOW(),
                versteckt_grund = NULL,
                meldungen_anzahl = 0
            WHERE id = $1
        `, [id, admin]);

        await pool.query(`
            UPDATE gemeinschafts_meldungen
            SET bearbeitet_von      = $1,
                bearbeitet_am       = NOW(),
                bearbeitungs_aktion = 'ignorieren'
            WHERE meldungstyp = $2 AND ziel_id = $3
        `, [admin, typ, id]);

        console.log(`⏭️  [AutoHide] Meldungen für ${typ} #${id} ignoriert von ${admin}`);
        return { success: true };
    } catch (err) {
        console.error('❌ [AutoHide] ignorierenMeldungen Fehler:', err.message);
        return { success: false, fehler: err.message };
    }
}

// ─── FILTER-HELFER für bestehende Routen ─────────────────────────────────────

/**
 * SQL-Fragment das versteckte Inhalte ausblendet.
 * Nutzung: WHERE cl.ist_versteckt = FALSE (oder IS NOT TRUE für Sicherheit)
 */
const NICHT_VERSTECKT_FILTER = 'ist_versteckt IS NOT TRUE';

module.exports = {
    getModerationQueue,
    freigebenInhalt,
    löschenInhalt,
    ignorierenMeldungen,
    MELDUNGEN_SCHWELLENWERT,
    NICHT_VERSTECKT_FILTER,
};