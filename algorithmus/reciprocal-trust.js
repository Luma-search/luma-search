/**
 * LUMA RECIPROCAL TRUST ALGORITHMUS (TRUST FLOW)
 * ─────────────────────────────────────────────────────────────────────────────
 * Dieses Modul berechnet einen "Trust Flow"-Score für eine URL basierend auf den
 * eingehenden Links (Backlinks), die sie von anderen Seiten im Luma-Index erhält.
 *
 * LOGIK:
 * 1. Vertrauen fließt von einer Seite zur anderen. Ein Link von einer hoch-
 *    vertrauenswürdigen Seite (hoher Trust-Score) ist wertvoller.
 * 2. Der übertragene Trust wird durch die Anzahl der ausgehenden Links auf der
 *    Quellseite geteilt. Eine Seite mit 100 Links vererbt weniger Trust pro Link
 *    als eine Seite mit nur 5 Links.
 * 3. Community-Bewertungen (User-Votes) der Quellseite modifizieren den Trust-Fluss.
 *    Ein Link von einer von der Community geliebten Seite ist mehr wert.
 *
 * AUSWIRKUNG:
 * Neue, qualitativ hochwertige Seiten können schneller an Sichtbarkeit gewinnen,
 * wenn sie von bereits etablierten und von der Community geschätzten Seiten
 * empfohlen (verlinkt) werden.
 *
 * DATENBANK-VORAUSSETZUNGEN:
 * - Eine Tabelle `backlinks` mit den Spalten `source_url` und `target_url`.
 *   Diese muss vom Crawler befüllt werden.
 * - Die Haupt-Tabelle der Seiten (z.B. `pages`) muss für jede Seite den
 *   `trust_score` und die `total_outgoing_links` enthalten.
 * - Die `votes`-Tabelle wird für die Community-Bewertung genutzt.
 */

'use strict';

const DAMPING_FACTOR = 0.85; // Standard-Wert, ähnlich PageRank

/**
 * Berechnet einen Multiplikator basierend auf den Community-Votes einer Seite.
 * @param {object} votes - Objekt mit { positive_votes, negative_votes }.
 * @returns {number} - Ein Multiplikator (z.B. 1.2 für sehr positiv, 0.8 für negativ).
 */
function getCommunityMultiplier(votes) {
    if (!votes) return 1.0;

    const { positive_votes, negative_votes } = votes;
    const totalVotes = positive_votes + negative_votes;

    if (totalVotes < 5) {
        return 1.0; // Nicht genug Stimmen, neutraler Einfluss
    }

    const approvalRate = positive_votes / totalVotes;

    if (approvalRate >= 0.8 && totalVotes >= 20) return 1.2; // Stark von der Community empfohlen
    if (approvalRate >= 0.65) return 1.1; // Positiv bewertet
    if (approvalRate < 0.35 && totalVotes >= 10) return 0.8; // Negativ bewertet
    if (approvalRate < 0.5) return 0.9; // Leicht negativ

    return 1.0; // Neutral / leicht positiv
}

/**
 * Berechnet den "Reciprocal Trust" Score für eine einzelne Ziel-URL.
 * Diese Funktion ist für den Echtzeit-Einsatz während des Rankings gedacht.
 *
 * @param {string} targetUrl - Die URL, für die der Score berechnet werden soll.
 * @param {object} dbPool - Der PostgreSQL-Connection-Pool.
 * @returns {Promise<number>} - Der berechnete Reciprocal Trust Score (typischerweise 0-15).
 */
async function calculateReciprocalTrust(targetUrl, dbPool) {
    let totalTrustFlow = 0;

    try {
        // 1. Finde alle Seiten, die auf die targetUrl verlinken (eingehende Links)
        const backlinksResult = await dbPool.query(
            'SELECT DISTINCT source_url FROM backlinks WHERE target_url = $1',
            [targetUrl]
        );

        if (backlinksResult.rows.length === 0) {
            return 0; // Keine eingehenden Links, kein Trust Flow.
        }

        const sourceUrls = backlinksResult.rows.map(row => row.source_url);

        // 2. Hole die relevanten Daten für alle Quell-Seiten in einer einzigen Abfrage
        const sourceDataResult = await dbPool.query(
            `SELECT
                p.url,
                p.trust_score,
                p.total_outgoing_links,
                COALESCE(v.positive_votes, 0) as positive_votes,
                COALESCE(v.negative_votes, 0) as negative_votes
             FROM pages p
             LEFT JOIN votes v ON p.url = v.url
             WHERE p.url = ANY($1::text[])`,
            [sourceUrls]
        );
        
        const sourceDataMap = new Map(sourceDataResult.rows.map(row => [row.url, row]));

        // 3. Berechne den Trust Flow für jeden eingehenden Link
        for (const sourceUrl of sourceUrls) {
            const data = sourceDataMap.get(sourceUrl);

            if (!data || !data.trust_score) continue;

            const sourceTrust = data.trust_score;
            const outgoingLinksCount = Math.max(1, data.total_outgoing_links || 1);
            const communityMultiplier = getCommunityMultiplier({
                positive_votes: data.positive_votes,
                negative_votes: data.negative_votes
            });

            // Die Kern-Formel:
            const trustPassed = (sourceTrust / outgoingLinksCount) * DAMPING_FACTOR * communityMultiplier;
            totalTrustFlow += trustPassed;
        }

        // Normalisiere den Score, um extreme Ausreißer zu vermeiden (logarithmische Skalierung)
        const normalizedScore = Math.log1p(totalTrustFlow);

        // Skaliere es auf einen sinnvollen Bereich, z.B. max 15 Bonuspunkte
        return Math.min(15, normalizedScore * 5);

    } catch (error) {
        console.error(`[ReciprocalTrust] Fehler bei der Berechnung für ${targetUrl}:`, error);
        return 0; // Im Fehlerfall keinen Bonus geben
    }
}

/**
 * Hintergrund-Job: Berechnet den Reciprocal Trust für ALLE Seiten und speichert ihn.
 * Dies sollte periodisch (z.B. nächtlich) laufen, um die Echtzeit-Suche zu entlasten.
 *
 * @param {object} dbPool - Der PostgreSQL-Connection-Pool.
 */
async function updateAllReciprocalTrustScores(dbPool) {
    console.log('[ReciprocalTrust Job] Starte Neuberechnung aller Trust-Flow-Scores...');
    const startTime = Date.now();
    const allPagesResult = await dbPool.query('SELECT url FROM pages');
    const allUrls = allPagesResult.rows.map(row => row.url);

    for (let i = 0; i < allUrls.length; i++) {
        const score = await calculateReciprocalTrust(allUrls[i], dbPool);
        await dbPool.query('UPDATE pages SET reciprocal_trust_score = $1 WHERE url = $2', [score, allUrls[i]]);
        if ((i + 1) % 500 === 0) console.log(`[ReciprocalTrust Job] ${i + 1} / ${allUrls.length} Seiten aktualisiert...`);
    }

    const duration = (Date.now() - startTime) / 1000;
    console.log(`[ReciprocalTrust Job] ✅ Erfolgreich ${allUrls.length} Seiten in ${duration.toFixed(2)}s aktualisiert.`);
}

module.exports = {
    calculateReciprocalTrust,
    updateAllReciprocalTrustScores,
    getCommunityMultiplier
};