/**
 * LUMA USER JOURNEY ALGORITHMUS (PREDICTIVE BROWSING + SOFT PERSONALISIERUNG)
 * ─────────────────────────────────────────────────────────────────────────────
 * Dieses Modul analysiert das Verhalten von Nutzern in zwei Dimensionen:
 *
 * 1. JOURNEY-PFADE (kollektiv, sessionbasiert)
 *    Wenn viele Nutzer in derselben Session erst Seite A positiv bewerten (Like)
 *    und kurz darauf Seite B positiv bewerten, entsteht eine starke Verbindung.
 *    Seite B wird zum logischen "Nächsten Schritt" für Seite A.
 *
 *    BEISPIEL:
 *    Nutzer sucht "Python lernen" -> Liked "Python Installation" (A)
 *    ... 5 Min später ...
 *    Nutzer liked "Erstes Python Script" (B)
 *    -> Algorithmus lernt: Wer A liest, will danach oft B lesen.
 *
 * 2. SOFT PERSONALISIERUNG (individuell, pro eingeloggtem Nutzer)
 *    Wenn ein Nutzer in der Vergangenheit Tech-Seiten geliked hat,
 *    bekommen Tech-Ergebnisse einen kleinen Boost von +3.
 *    "Magisch, nicht creepy" — komplett anonym, keine Tracking-Profile.
 *    Daten kommen aus luma_nutzer_stimmen (eigene Votes des Nutzers).
 *    Ranking-Boost: +3 (gelikte Domain) / +2 (gelikte Kategorie)
 *
 * DATENBANK-VORAUSSETZUNGEN:
 * 1. Tabelle `vote_history`:        session_id, url, vote_type, timestamp
 * 2. Tabelle `journey_links`:       source_url, target_url, strength, confidence_score
 * 3. Tabelle `luma_nutzer_stimmen`: nutzer_id, domain, stimm_wert (Trust-System)
 */

'use strict';

// Konfiguration
const MIN_PATH_STRENGTH = 3; // Mindestens 3 Nutzer müssen diesen Pfad genommen haben
const MAX_TIME_WINDOW_MINUTES = 60; // Nur Votes innerhalb von 60 Min zählen als "Journey"

/**
 * Hintergrund-Job: Analysiert die Vote-Historie und lernt neue Pfade.
 * Sollte regelmäßig (z.B. jede Nacht) laufen.
 * 
 * @param {object} dbPool - Der PostgreSQL-Connection-Pool
 */
async function analyzeUserJourneys(dbPool) {
    console.log('[UserJourney] Starte Analyse der Nutzer-Pfade...');
    const start = Date.now();

    try {
        // 1. Bereinigen der alten Journey-Links (optional: oder inkrementelles Update)
        // Hier: Full Rebuild für Konsistenz
        await dbPool.query('TRUNCATE TABLE journey_links');

        // 2. Komplexe Analyse-Query
        // Findet Paare von Votes (A -> B) innerhalb derselben Session,
        // wobei B zeitlich NACH A kam, aber innerhalb des Zeitfensters.
        const query = `
            INSERT INTO journey_links (source_url, target_url, strength, confidence_score)
            SELECT 
                t1.url as source_url,
                t2.url as target_url,
                COUNT(*) as strength,
                (COUNT(*)::float / (SELECT COUNT(*) FROM vote_history WHERE url = t1.url AND vote_type = 'up')) * 100 as confidence_score
            FROM vote_history t1
            JOIN vote_history t2 ON t1.session_id = t2.session_id
            WHERE 
                t1.vote_type = 'up' AND t2.vote_type = 'up' -- Nur positive Signale
                AND t1.url != t2.url                        -- Keine Selbst-Referenz
                AND t2.created_at > t1.created_at           -- B muss nach A kommen
                AND t2.created_at < t1.created_at + interval '${MAX_TIME_WINDOW_MINUTES} minutes'
            GROUP BY t1.url, t2.url
            HAVING COUNT(*) >= $1 -- Mindestanzahl an Nutzern
            ORDER BY strength DESC;
        `;

        const result = await dbPool.query(query, [MIN_PATH_STRENGTH]);
        
        const duration = (Date.now() - start) / 1000;
        console.log(`[UserJourney] ✅ Analyse abgeschlossen. ${result.rowCount || 0} Pfade gelernt in ${duration.toFixed(2)}s.`);

    } catch (error) {
        console.error('[UserJourney] ❌ Fehler bei der Analyse:', error);
    }
}

/**
 * Ruft die logischen "nächsten Schritte" für eine bestimmte URL ab.
 * Wird im Ranking verwendet, um verwandte Ergebnisse zu boosten.
 * 
 * @param {string} currentUrl - Die URL, die der Nutzer gerade ansieht oder gesucht hat
 * @param {object} dbPool - DB Connection
 * @param {number} limit - Max Anzahl der Vorschläge
 * @returns {Promise<Array>} - Liste von URLs mit Score
 */
async function getNextSteps(currentUrl, dbPool, limit = 3) {
    try {
        const res = await dbPool.query(
            `SELECT target_url, strength, confidence_score 
             FROM journey_links 
             WHERE source_url = $1 
             ORDER BY strength DESC, confidence_score DESC 
             LIMIT $2`,
            [currentUrl, limit]
        );
        return res.rows;
    } catch (error) {
        console.error(`[UserJourney] Fehler beim Abrufen für ${currentUrl}:`, error);
        return [];
    }
}

/**
 * Speichert einen Vote-Event für die spätere Analyse.
 * Muss aufgerufen werden, wenn ein Nutzer liked.
 * 
 * @param {object} dbPool 
 * @param {string} url 
 * @param {string} sessionId 
 * @param {string} voteType - 'up' oder 'down'
 */
async function logVoteEvent(dbPool, url, sessionId, voteType) {
    // Nur loggen, keine Analyse (Performance!)
    try {
        await dbPool.query(
            `INSERT INTO vote_history (url, session_id, vote_type) VALUES ($1, $2, $3)`,
            [url, sessionId, voteType]
        );
    } catch (error) {
        console.error('[UserJourney] Logging failed:', error);
    }
}

// ─── Soft-Personalisierung ────────────────────────────────────────────────────

// Kategorie-Muster: Domain-Keyword → Kategorie (lexikalisch, kein DB-Zugriff)
const KATEGORIE_MUSTER = {
    tech:     ['chip', 'heise', 'golem', 'github', 'stackoverflow', 'developer',
                'computerbase', 'notebookcheck', 'techcrunch', 'ct.de', 'linux',
                'arduino', 'raspberry', 'bleepingcomputer'],
    news:     ['spiegel', 'stern', 'zeit.de', 'focus', 'faz.', 'tagesschau',
                'sueddeutsche', 'welt.de', 'handelsblatt', 'reuters', 'bbc.',
                'cnn.', 'ard.', 'zdf.', 'ntv.', 'ndr.', 'mdr.'],
    shopping: ['amazon', 'ebay', 'otto.de', 'zalando', 'mediamarkt', 'saturn.',
                'idealo', 'geizhals', 'mydealz', 'check24', 'billiger.'],
    sport:    ['kicker', 'sportschau', 'transfermarkt', 'goal.', 'sport1', 'ran.de'],
    wiki:     ['wikipedia', 'wikihow', 'fandom.com', 'wikia.', 'wikidata'],
    health:   ['netdoktor', 'apotheke', 'gesundheit', 'doctolib', 'jameda', 'healthline'],
    finance:  ['finanzen.', 'boerse.', 'comdirect', 'sparkasse', 'ing.de',
                'dkb.de', 'consorsbank', 'onvista'],
    travel:   ['booking.', 'tripadvisor', 'airbnb', 'holidaycheck', 'expedia', 'skyscanner'],
    science:  ['nature.com', 'sciencedirect', 'pubmed', 'arxiv', 'studyflix',
                'simpleclub', 'sofatutor'],
};

/**
 * Leitet die Kategorie einer Domain lexikalisch ab — kein DB-Zugriff.
 * Wird sowohl intern als auch von ranking.js für Result-Domains verwendet.
 *
 * @param {string} domain  z.B. "heise.de"
 * @returns {string|null}  Kategorie oder null
 */
function inferKategorie(domain) {
    const d = domain.toLowerCase();
    for (const [kategorie, muster] of Object.entries(KATEGORIE_MUSTER)) {
        if (muster.some(m => d.includes(m))) return kategorie;
    }
    return null;
}

/**
 * Lädt die persönlichen Interessen eines eingeloggten Nutzers
 * aus seinen positiven Votes (luma_nutzer_stimmen).
 * Wird einmal pro Suchanfrage aufgerufen und ans Ranking weitergegeben.
 *
 * Ranking-Boost (in ranking.js):
 *   +3 → Nutzer hat diese Domain bereits geliked   (direktes Signal)
 *   +2 → Nutzer mag diese Kategorie (Tech, News …) (indirektes Signal)
 *
 * @param {number} userId  - req.session.userId
 * @param {object} pool    - PostgreSQL-Pool
 * @returns {Promise<{ likedDomains: Set<string>, kategorien: Map<string, number> }>}
 */
async function getUserInterests(userId, pool) {
    try {
        const { rows } = await pool.query(
            `SELECT domain
             FROM public.luma_nutzer_stimmen
             WHERE nutzer_id = $1 AND stimm_wert = 1
             ORDER BY erstellt_am DESC
             LIMIT 100`,
            [userId]
        );

        const likedDomains = new Set(rows.map(r => r.domain));

        // Kategorie-Frequenz aus den gelikten Domains ableiten
        const kategorien = new Map();
        for (const { domain } of rows) {
            const k = inferKategorie(domain);
            if (k) kategorien.set(k, (kategorien.get(k) || 0) + 1);
        }

        return { likedDomains, kategorien };

    } catch {
        // Personalisierung ist immer optional — nie Suche blockieren
        return { likedDomains: new Set(), kategorien: new Map() };
    }
}

module.exports = {
    analyzeUserJourneys,
    getNextSteps,
    logVoteEvent,
    getUserInterests,
    inferKategorie,
};
