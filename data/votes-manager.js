/**
 * VOTES MANAGER — PostgreSQL Edition
 * Speichert anonyme Reaktionen (positiv/neutral/negativ) in der Tabelle
 * luma_domain_votes.  Kein Nutzername, kein Text — rechtlich unbedenklich.
 */

const { pool } = require('../crawler_new/db.js');

const VALID_TYPES = ['positive', 'neutral', 'negative'];

/**
 * Erstellt die Tabelle, falls sie noch nicht existiert.
 * Wird einmal beim Server-Start aufgerufen.
 */
async function initVotesTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS luma_domain_votes (
            domain      TEXT        PRIMARY KEY,
            positive    INTEGER     NOT NULL DEFAULT 0,
            neutral     INTEGER     NOT NULL DEFAULT 0,
            negative    INTEGER     NOT NULL DEFAULT 0,
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    console.log('✅ luma_domain_votes Tabelle bereit.');
}

/**
 * Fügt eine Reaktion hinzu (UPSERT).
 * @param {string} domain
 * @param {'positive'|'neutral'|'negative'} type
 * @returns {{ positive, neutral, negative, total }}
 */
async function addVote(domain, type) {
    if (!domain || !VALID_TYPES.includes(type)) {
        throw new Error('Ungültiger Vote-Typ');
    }

    const normalized = domain.replace(/^www\./, '').toLowerCase();

    // UPSERT: wenn Domain noch nicht vorhanden, anlegen; sonst Zähler erhöhen
    const res = await pool.query(`
        INSERT INTO luma_domain_votes (domain, ${type})
        VALUES ($1, 1)
        ON CONFLICT (domain) DO UPDATE
            SET ${type}     = luma_domain_votes.${type} + 1,
                updated_at  = NOW()
        RETURNING positive, neutral, negative
    `, [normalized]);

    const row = res.rows[0];
    return {
        positive: row.positive,
        neutral:  row.neutral,
        negative: row.negative,
        total:    row.positive + row.neutral + row.negative
    };
}

/**
 * Gibt die Stimmenzahlen für eine Domain zurück.
 * @param {string} domain
 * @returns {{ positive, neutral, negative, total }}
 */
async function getVotes(domain) {
    const normalized = domain.replace(/^www\./, '').toLowerCase();

    const res = await pool.query(
        `SELECT positive, neutral, negative
           FROM luma_domain_votes
          WHERE domain = $1`,
        [normalized]
    );

    if (res.rows.length === 0) {
        return { positive: 0, neutral: 0, negative: 0, total: 0 };
    }

    const { positive, neutral, negative } = res.rows[0];
    return { positive, neutral, negative, total: positive + neutral + negative };
}

/**
 * Lädt Votes für mehrere Domains in einer einzigen DB-Abfrage (Batch).
 * @param {string[]} domains - Array von Domain-Strings
 * @returns {Promise<Map<string, { positive, neutral, negative, total }>>}
 */
async function getVotesBatch(domains) {
    if (!domains || domains.length === 0) return new Map();

    const normalized = [...new Set(domains.map(d => d.replace(/^www\./, '').toLowerCase()))];

    const res = await pool.query(
        `SELECT domain, positive, neutral, negative
           FROM luma_domain_votes
          WHERE domain = ANY($1::text[])`,
        [normalized]
    );

    const map = new Map();
    res.rows.forEach(row => {
        map.set(row.domain, {
            positive: row.positive,
            neutral:  row.neutral,
            negative: row.negative,
            total:    row.positive + row.neutral + row.negative
        });
    });
    return map;
}

/**
 * Nimmt einen bestehenden Vote zurück (dekrementiert den Zähler).
 * @param {string} domain
 * @param {'positive'|'neutral'|'negative'} type
 */
async function removeVote(domain, type) {
    if (!domain || !VALID_TYPES.includes(type)) {
        throw new Error('Ungültiger Vote-Typ');
    }
    const normalized = domain.replace(/^www\./, '').toLowerCase();

    const res = await pool.query(`
        UPDATE luma_domain_votes
           SET ${type}    = GREATEST(0, ${type} - 1),
               updated_at = NOW()
         WHERE domain = $1
        RETURNING positive, neutral, negative
    `, [normalized]);

    const row = res.rows[0] || { positive: 0, neutral: 0, negative: 0 };
    return {
        positive: row.positive,
        neutral:  row.neutral,
        negative: row.negative,
        total:    row.positive + row.neutral + row.negative
    };
}

/**
 * Wechselt den Vote-Typ (z.B. positive → negative).
 * @param {string} domain
 * @param {'positive'|'neutral'|'negative'} oldType
 * @param {'positive'|'neutral'|'negative'} newType
 */
async function changeVote(domain, oldType, newType) {
    if (!domain || !VALID_TYPES.includes(oldType) || !VALID_TYPES.includes(newType)) {
        throw new Error('Ungültiger Vote-Typ');
    }
    const normalized = domain.replace(/^www\./, '').toLowerCase();

    const res = await pool.query(`
        UPDATE luma_domain_votes
           SET ${oldType}  = GREATEST(0, ${oldType} - 1),
               ${newType}  = ${newType} + 1,
               updated_at  = NOW()
         WHERE domain = $1
        RETURNING positive, neutral, negative
    `, [normalized]);

    const row = res.rows[0] || { positive: 0, neutral: 0, negative: 0 };
    return {
        positive: row.positive,
        neutral:  row.neutral,
        negative: row.negative,
        total:    row.positive + row.neutral + row.negative
    };
}

/**
 * User-Vote tracken — verhindert Doppel-Votes pro Nutzer pro Domain.
 * Legt luma_nutzer_votes Tabelle an falls nicht vorhanden.
 */
async function initNutzerVotesTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS luma_nutzer_votes (
            id          SERIAL PRIMARY KEY,
            nutzer_id   INTEGER NOT NULL,
            domain      TEXT    NOT NULL,
            vote_typ    VARCHAR(10) NOT NULL CHECK (vote_typ IN ('positive','neutral','negative')),
            erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(nutzer_id, domain)
        );
        CREATE INDEX IF NOT EXISTS idx_nutzer_votes_domain  ON luma_nutzer_votes(domain);
        CREATE INDEX IF NOT EXISTS idx_nutzer_votes_nutzer  ON luma_nutzer_votes(nutzer_id);
    `);
}

/**
 * Gibt den aktuellen Vote eines Nutzers für eine Domain zurück.
 * @returns {'positive'|'neutral'|'negative'|null}
 */
async function getUserVote(nutzer_id, domain) {
    const normalized = domain.replace(/^www\./, '').toLowerCase();
    const res = await pool.query(
        `SELECT vote_typ FROM luma_nutzer_votes WHERE nutzer_id = $1 AND domain = $2`,
        [nutzer_id, normalized]
    );
    return res.rows[0]?.vote_typ || null;
}

/**
 * Verarbeitet einen Vote mit User-Tracking:
 * - Noch kein Vote: addVote
 * - Gleicher Vote nochmal: removeVote (Toggle)
 * - Anderer Vote: changeVote
 * @returns {{ action: 'added'|'removed'|'changed', ...votes }}
 */
async function processVote(nutzer_id, domain, newType) {
    if (!domain || !VALID_TYPES.includes(newType)) throw new Error('Ungültiger Vote-Typ');
    const normalized = domain.replace(/^www\./, '').toLowerCase();

    const existing = await getUserVote(nutzer_id, normalized);

    let result, action;

    if (!existing) {
        // Noch kein Vote → hinzufügen
        result = await addVote(normalized, newType);
        action = 'added';
        await pool.query(
            `INSERT INTO luma_nutzer_votes (nutzer_id, domain, vote_typ) VALUES ($1, $2, $3)
             ON CONFLICT (nutzer_id, domain) DO UPDATE SET vote_typ = $3, erstellt_am = NOW()`,
            [nutzer_id, normalized, newType]
        );
    } else if (existing === newType) {
        // Gleicher Vote → entfernen (Toggle)
        result = await removeVote(normalized, existing);
        action = 'removed';
        await pool.query(
            `DELETE FROM luma_nutzer_votes WHERE nutzer_id = $1 AND domain = $2`,
            [nutzer_id, normalized]
        );
    } else {
        // Anderer Vote → wechseln
        result = await changeVote(normalized, existing, newType);
        action = 'changed';
        await pool.query(
            `UPDATE luma_nutzer_votes SET vote_typ = $3, erstellt_am = NOW()
             WHERE nutzer_id = $1 AND domain = $2`,
            [nutzer_id, normalized, newType]
        );
    }

    return { action, ...result };
}

module.exports = { initVotesTable, initNutzerVotesTable, addVote, getVotes, getVotesBatch, removeVote, changeVote, getUserVote, processVote };