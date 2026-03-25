/**
 * SOURCE-RELIABILITY CHAIN ENGINE - v2.0
 * Teil des Luma Trust-Algorithmus
 *
 * KONZEPT: "Bad Neighborhood Penalty" + "Trust Chain Bonus"
 *
 * Eine Seite verliert Trust-Punkte, wenn sie auf unvertrauenswürdige Quellen
 * verlinkt (viele Dislikes oder niedriger Trust-Score). Umgekehrt erhält sie
 * einen kleinen Bonus, wenn sie auf institutionelle Hochqualitäts-Quellen zeigt.
 *
 * LOGIK:
 * - Seite A → verlinkt auf Seite B (viele Dislikes) → A verliert Punkte
 * - Seite A → verlinkt auf Wikipedia / .gov / Wissenschaft → A bekommt Bonus
 *
 * AUSWIRKUNG:
 * Selbstreinigung des Index. Webmaster werden motiviert:
 * 1. Schlechte ausgehende Links zu entfernen (vermeidet Penalty)
 * 2. Hochwertige Quellen zu zitieren (bekommt Bonus)
 *
 * NEU IN v2.0:
 * - Positiver Trust-Chain-Bonus (Links zu .gov, Wikipedia, Wissenschaft → +Punkte)
 * - 6-stufige Penalty-Skala statt 4-stufig
 * - Domain-Whitelist für immer vertrauenswürdige Institutionen
 * - Spam-Muster-Erkennung im Domain-Namen (Linkfarmen etc.)
 * - bonus und penalty separat ausgewiesen (netEffect = bonus - penalty)
 */

'use strict';

const { URL } = require('url');

// ─────────────────────────────────────────────────────────────────────────────
// KONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Immer vertrauenswürdige Domains — Links zu diesen geben einen kleinen Trust-Bonus.
 * Umfasst staatliche Stellen, Enzyklopädien, wissenschaftliche Datenbanken,
 * anerkannte Nachrichtenagenturen und technische Standardisierungsorgane.
 */
const TRUSTED_WHITELIST = new Set([
    // Enzyklopädien & Wikis
    'wikipedia.org', 'de.wikipedia.org', 'en.wikipedia.org',
    'fr.wikipedia.org', 'es.wikipedia.org', 'wikimedia.org', 'wikidata.org',
    // Deutsche Bundesbehörden
    'bundesregierung.de', 'bundestag.de', 'bundesrat.de',
    'bmi.bund.de', 'bmj.de', 'bmbf.de', 'bmwk.de',
    'rki.de', 'destatis.de', 'bundesbank.de', 'bafin.de', 'dwd.de',
    'bpb.de', 'bka.de', 'verfassungsschutz.de',
    // Europäische & internationale Institutionen
    'europa.eu', 'ec.europa.eu', 'who.int', 'un.org', 'oecd.org',
    'imf.org', 'worldbank.org', 'nato.int',
    // Wissenschaft & Forschung
    'nature.com', 'science.org', 'pubmed.ncbi.nlm.nih.gov',
    'arxiv.org', 'ncbi.nlm.nih.gov', 'scholar.google.com',
    'doi.org', 'orcid.org', 'springer.com', 'elsevier.com',
    // Nachrichtenagenturen (international anerkannt)
    'reuters.com', 'apnews.com', 'afp.com', 'dpa.de',
    'bbc.com', 'bbc.co.uk',
    // Große deutsche Qualitätszeitungen
    'spiegel.de', 'zeit.de', 'faz.net', 'sueddeutsche.de',
    'welt.de', 'tagesspiegel.de', 'heise.de', 'tagesschau.de',
    // Technische Standards
    'w3.org', 'ietf.org', 'iso.org', 'mozilla.org',
    // Code & Entwickler
    'stackoverflow.com', 'github.com', 'mdn.io', 'developer.mozilla.org',
]);

/**
 * Regex-Muster für bekannte Spam/Linkfarm-Domain-Strukturen.
 * Domains die DIESE Muster enthalten, erhalten automatisch eine Vorab-Strafe.
 */
const SPAM_DOMAIN_PATTERNS = [
    /^(?:click|clickbait|ad|ads|promo|affiliate|ref\d*|track|redir|redirect)/i,
    /linkfarm/i,
    /\d{4,}links/i,          // z.B. "10000links.com"
    /(?:free|gratis)-.*spam/i,
    /(?:seo|backlink)-.*(?:farm|network|exchange)/i,
];

/** Maximale kumulierte Strafe aus ALLEN ausgehenden Links */
const MAX_PENALTY = 35;

/** Maximaler kumulierter Bonus aus ALLEN ausgehenden Links */
const MAX_BONUS = 8;

/** Minimum Community-Votes damit die Dislike-Statistik aussagekräftig ist */
const MIN_VOTES = 5;

/** Bonus pro Whitelist-Link */
const WHITELIST_BONUS_PER_LINK = 1.5;

/** Max. Anzahl Whitelist-Links die Bonus geben (Anti-Gaming: kein "1000 Wikipedia-Links") */
const MAX_WHITELIST_LINKS = 4;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER-FUNKTIONEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Holt Reputation aus Map oder Objekt sicher ab.
 *
 * @param {string} domain
 * @param {Map|Object} source
 * @returns {Object|null}
 */
function _getReputation(domain, source) {
    if (!source) return null;
    if (source instanceof Map)    return source.get(domain) || null;
    if (typeof source === 'object') return source[domain]   || null;
    return null;
}

/**
 * Extrahiert saubere ausgehende Domains aus dem Page-Item.
 * Unterstützt vorkalkulierte 'outboundDomains' oder rohe 'outboundLinks'.
 *
 * @param {Object} item - Das Dokument aus dem Index
 * @returns {Set<string>}
 */
function _getOutboundDomains(item) {
    const domains = new Set();

    // Fall A: Crawler hat bereits normalisierte Domain-Liste geliefert
    if (item.outboundDomains && Array.isArray(item.outboundDomains)) {
        item.outboundDomains.forEach(d => {
            if (typeof d === 'string') {
                domains.add(d.toLowerCase().replace(/^www\./, ''));
            }
        });
        return domains;
    }

    // Fall B: Aus rohen 'outboundLinks' (URLs) extrahieren
    if (item.outboundLinks && Array.isArray(item.outboundLinks)) {
        item.outboundLinks.forEach(link => {
            try {
                const u = new URL(link);
                if (u.protocol === 'http:' || u.protocol === 'https:') {
                    domains.add(u.hostname.replace(/^www\./, '').toLowerCase());
                }
            } catch (e) {}
        });
        return domains;
    }

    return domains;
}

/**
 * Prüft ob ein Domain-Name bekannte Spam/Linkfarm-Muster enthält.
 *
 * @param {string} domain
 * @returns {boolean}
 */
function _isSpamPatternDomain(domain) {
    return SPAM_DOMAIN_PATTERNS.some(pattern => pattern.test(domain));
}

// ─────────────────────────────────────────────────────────────────────────────
// KERN-FUNKTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Berechnet Strafe UND Bonus basierend auf den ausgehenden Links der Seite.
 *
 * @param {Object} pageItem
 *   Muss enthalten: url (string), outboundDomains (string[]) ODER outboundLinks (string[])
 * @param {Map<string, Object>|Object} reputationMap
 *   Format: Key = Domain, Value = { trustScore: number, votes: { positive: number, negative: number } }
 *
 * @returns {{
 *   penalty:               number,   // Gesamtstrafe (0–MAX_PENALTY)
 *   bonus:                 number,   // Gesamtbonus (0–MAX_BONUS)
 *   netEffect:             number,   // bonus - penalty (kann negativ sein)
 *   details:               string[], // Einzelne Begründungen pro Domain
 *   linkedBadDomainsCount: number,
 *   linkedGoodDomainsCount: number
 * }}
 */
function calculateReliabilityPenalty(pageItem, reputationMap) {
    let penaltyScore = 0;
    let bonusScore   = 0;
    const details    = [];

    // Eigene Domain ermitteln (Self-Links sollen nicht zählen)
    let selfDomain = '';
    try {
        if (pageItem.url) {
            selfDomain = new URL(pageItem.url).hostname.replace(/^www\./, '').toLowerCase();
        }
    } catch(e) {}

    // Ausgehende Domains extrahieren + eigene Domain entfernen
    const outboundDomains = _getOutboundDomains(pageItem);
    if (selfDomain) outboundDomains.delete(selfDomain);

    if (outboundDomains.size === 0) {
        return { penalty: 0, bonus: 0, netEffect: 0, details: [], linkedBadDomainsCount: 0, linkedGoodDomainsCount: 0 };
    }

    let linkedBadDomainsCount  = 0;
    let linkedGoodDomainsCount = 0;
    let whitelistLinksFound    = 0;

    for (const targetDomain of outboundDomains) {

        // ─── POSITIVER PFAD A: Whitelist-Domain → Trust-Bonus ───
        // Normalisierung auf Hauptdomain für Whitelist-Check (z.B. "de.wikipedia.org")
        const isWhitelisted = TRUSTED_WHITELIST.has(targetDomain) ||
                              TRUSTED_WHITELIST.has(targetDomain.split('.').slice(-2).join('.'));

        if (isWhitelisted && whitelistLinksFound < MAX_WHITELIST_LINKS) {
            bonusScore += WHITELIST_BONUS_PER_LINK;
            linkedGoodDomainsCount++;
            whitelistLinksFound++;
            details.push(`✓ ${targetDomain}: Vertrauenswürdige Quelle (Whitelist) → +${WHITELIST_BONUS_PER_LINK} Pkt`);
            continue; // Keine weiteren Checks für Whitelist-Domains
        }

        // ─── NEGATIVER PFAD A: Spam-Muster im Domain-Namen ───
        if (_isSpamPatternDomain(targetDomain)) {
            const p = 5;
            penaltyScore += p;
            linkedBadDomainsCount++;
            details.push(`✗ ${targetDomain}: Spam-Domainmuster erkannt → -${p} Pkt`);
            // Kein continue — auch Reputation prüfen falls vorhanden
        }

        // Reputation aus der Map holen
        const reputation = _getReputation(targetDomain, reputationMap);

        // Unbekannte Domain ohne Reputation → "in dubio pro reo" (keine weitere Penalty)
        if (!reputation) continue;

        // ─── COMMUNITY-VOTES: 6-stufige Skala ───
        const votes      = reputation.votes || { positive: 0, negative: 0 };
        const totalVotes = (votes.positive || 0) + (votes.negative || 0);

        if (totalVotes >= MIN_VOTES) {
            const dislikeRatio = votes.negative / totalVotes;
            const likeRatio    = votes.positive  / totalVotes;

            if (dislikeRatio >= 0.90) {
                // Extrem: fast ausschließlich gehasst
                const p = 8;
                penaltyScore += p;
                linkedBadDomainsCount++;
                details.push(`✗ ${targetDomain}: Extrem hohe Dislike-Rate (${Math.round(dislikeRatio*100)}%) → -${p} Pkt`);
            } else if (dislikeRatio >= 0.80) {
                // Sehr hohe Ablehnung
                const p = 6;
                penaltyScore += p;
                linkedBadDomainsCount++;
                details.push(`✗ ${targetDomain}: Hohe Dislike-Rate (${Math.round(dislikeRatio*100)}%) → -${p} Pkt`);
            } else if (dislikeRatio >= 0.60) {
                // Deutlich negative Community-Wertung
                const p = 3;
                penaltyScore += p;
                linkedBadDomainsCount++;
                details.push(`✗ ${targetDomain}: Negative Wertung (${Math.round(dislikeRatio*100)}% Dislikes) → -${p} Pkt`);
            } else if (dislikeRatio >= 0.45) {
                // Leicht negativ — kleine Warnung
                const p = 1;
                penaltyScore += p;
                details.push(`✗ ${targetDomain}: Leicht negativ bewertet (${Math.round(dislikeRatio*100)}%) → -${p} Pkt`);
            } else if (likeRatio >= 0.85 && totalVotes >= 20 && whitelistLinksFound < MAX_WHITELIST_LINKS) {
                // Stark positiv bewertete, gut bekannte Domain → kleiner Bonus
                bonusScore += 1.0;
                linkedGoodDomainsCount++;
                whitelistLinksFound++;
                details.push(`✓ ${targetDomain}: Sehr positiv bewertet (${Math.round(likeRatio*100)}%, ${totalVotes} Votes) → +1.0 Pkt`);
            }
        }

        // ─── TRUST-SCORE: 5-stufige Skala ───
        if (reputation.trustScore !== undefined && reputation.trustScore !== null) {
            const ts = reputation.trustScore;

            if (ts < 10) {
                // Scam / Malware-Seite
                const p = 10;
                penaltyScore += p;
                linkedBadDomainsCount++;
                details.push(`✗ ${targetDomain}: Scam/Malware-Verdacht (Trust ${ts}/100) → -${p} Pkt`);
            } else if (ts < 20) {
                // Kritischer Spam
                const p = 8;
                penaltyScore += p;
                linkedBadDomainsCount++;
                details.push(`✗ ${targetDomain}: Kritischer Trust-Score (${ts}/100) → -${p} Pkt`);
            } else if (ts < 30) {
                // Sehr niedriger Trust
                const p = 5;
                penaltyScore += p;
                linkedBadDomainsCount++;
                details.push(`✗ ${targetDomain}: Sehr niedriger Trust (${ts}/100) → -${p} Pkt`);
            } else if (ts < 40) {
                // Niedrige Qualität
                const p = 3;
                penaltyScore += p;
                details.push(`✗ ${targetDomain}: Niedriger Trust (${ts}/100) → -${p} Pkt`);
            } else if (ts >= 80 && whitelistLinksFound < MAX_WHITELIST_LINKS) {
                // Hoher Trust → kleiner Bonus
                bonusScore += 0.5;
                linkedGoodDomainsCount++;
                whitelistLinksFound++;
                details.push(`✓ ${targetDomain}: Hoher Trust-Score (${ts}/100) → +0.5 Pkt`);
            }
        }
    }

    // Strafe und Bonus deckeln
    const finalPenalty = Math.min(Math.round(penaltyScore), MAX_PENALTY);
    const finalBonus   = Math.min(Math.round(bonusScore * 10) / 10, MAX_BONUS);
    const netEffect    = finalBonus - finalPenalty;

    return {
        penalty:               finalPenalty,
        bonus:                 finalBonus,
        netEffect,
        details,
        linkedBadDomainsCount,
        linkedGoodDomainsCount
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    calculateReliabilityPenalty,

    // Interne Helpers (für Tests und Debugging)
    _getOutboundDomains,
    _getReputation,
    _isSpamPatternDomain,

    // Konfiguration
    TRUSTED_WHITELIST,
    SPAM_DOMAIN_PATTERNS,
    MAX_PENALTY,
    MAX_BONUS,
    MIN_VOTES
};
