/**
 * LUMA DOMAIN DIVERSITY ALGORITHMUS - v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Sorgt für Vielfalt in den Suchergebnissen (SERP).
 * Verhindert, dass eine einzelne Domain (z.B. Pinterest, Amazon)
 * die erste Seite dominiert.
 *
 * NEU IN v2.0:
 * - Domain-Familien-Erkennung (amazon.de + amazon.com = gleiche Familie = ein Slot)
 * - Subdomain-Normalisierung (blog.example.com → example.com)
 * - Intent-basierte Limits (NEWS = lockerer, COMMERCIAL = strenger)
 * - Diversity-Score (Herfindahl-Index) zur Qualitätsmessung
 * - detectBrandSearch() mit strukturiertem Rückgabewert
 * - Detaillierte Stats & Debug-Informationen für ranking.js
 *
 * LOGIK:
 * 1. Maximal N Ergebnisse derselben Domain-Familie in den Top 10.
 * 2. Überschüssige Ergebnisse werden nicht gelöscht, sondern auf Seite 2+ verschoben.
 * 3. Die ursprüngliche Sortierung (nach Relevanz-Score) bleibt erhalten.
 */

'use strict';

const { URL } = require('url');

// ─────────────────────────────────────────────────────────────────────────────
// KONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bekannte Domain-Familien: Verschiedene TLDs derselben Marke zählen als EIN Slot.
 * Verhindert, dass amazon.de + amazon.com zusammen Top 10 monopolisieren.
 * Format: { 'normalisierte-domain' → 'familien-name' }
 */
const DOMAIN_FAMILIES = {
    // Amazon
    'amazon.de': 'amazon', 'amazon.com': 'amazon', 'amazon.co.uk': 'amazon',
    'amazon.fr': 'amazon', 'amazon.es': 'amazon', 'amazon.it': 'amazon',
    'amazon.nl': 'amazon', 'amazon.pl': 'amazon', 'amazon.at': 'amazon',
    // Google
    'google.de': 'google', 'google.com': 'google', 'google.co.uk': 'google',
    'google.at': 'google', 'google.ch': 'google',
    // eBay
    'ebay.de': 'ebay', 'ebay.com': 'ebay', 'ebay.co.uk': 'ebay',
    'ebay.at': 'ebay',
    // Wikipedia / Wikimedia
    'wikipedia.org': 'wikipedia',
    'de.wikipedia.org': 'wikipedia', 'en.wikipedia.org': 'wikipedia',
    'fr.wikipedia.org': 'wikipedia', 'es.wikipedia.org': 'wikipedia',
    'wikimedia.org': 'wikipedia', 'wikidata.org': 'wikipedia',
    // Pinterest
    'pinterest.de': 'pinterest', 'pinterest.com': 'pinterest',
    // Social Media
    'twitter.com': 'twitter', 'x.com': 'twitter',
    'facebook.com': 'facebook', 'fb.com': 'facebook',
    // Microsoft
    'microsoft.com': 'microsoft', 'azure.com': 'microsoft',
    'office.com': 'microsoft', 'live.com': 'microsoft',
    // Apple
    'apple.com': 'apple', 'icloud.com': 'apple',
};

/**
 * Intent-basierte Diversity-Konfiguration.
 * NEWS:        Mehr vom gleichen Publisher erlaubt (Autorität zählt mehr)
 * COMMERCIAL:  Strenger (Shopping-Vielfalt für den Nutzer wichtig)
 * INFORMATIONAL: Standard
 */
const INTENT_LIMITS = {
    NEWS:          { maxPerDomainTop10: 10, maxPerDomainTotal: 20, topSize: 10 },
    COMMERCIAL:    { maxPerDomainTop10: 2, maxPerDomainTotal: 3, topSize: 10 },
    INFORMATIONAL: { maxPerDomainTop10: 2, maxPerDomainTotal: 4, topSize: 10 },
    DEFAULT:       { maxPerDomainTop10: 3, maxPerDomainTotal: 5, topSize: 10 },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER-FUNKTIONEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrahiert den normalisierten Hostnamen aus einer URL.
 * Entfernt 'www.' und konvertiert zu Kleinbuchstaben.
 *
 * @param {string} urlString - Die URL des Suchergebnisses
 * @returns {string} - Normalisierte Domain (z.B. "wikipedia.org") oder 'unknown'
 */
function getDomain(urlString) {
    if (!urlString || typeof urlString !== 'string') return 'unknown';
    try {
        const urlToParse = urlString.startsWith('http') ? urlString : `https://${urlString}`;
        const u = new URL(urlToParse);
        return u.hostname.toLowerCase().replace(/^www\./, '');
    } catch (e) {
        return 'unknown';
    }
}

/**
 * NEU: Ermittelt die "Diversity-ID" einer Domain.
 * Dies ist der Schlüssel für die Slot-Vergabe im Diversity-Filter.
 *
 * Reihenfolge der Auflösung:
 * 1. Bekannte Domain-Familie (amazon.de → 'amazon')
 * 2. Subdomain-Reduktion (blog.example.com → 'example.com')
 * 3. Fallback: rohe normalisierte Domain
 *
 * @param {string} urlString
 * @returns {string} - Diversity-ID (z.B. 'amazon', 'wikipedia', 'example.com')
 */
function getDiversityId(urlString) {
    const rawDomain = getDomain(urlString);
    if (rawDomain === 'unknown') return 'unknown';

    // 1. Bekannte Domain-Familie hat höchste Priorität
    if (DOMAIN_FAMILIES[rawDomain]) {
        return DOMAIN_FAMILIES[rawDomain];
    }

    const parts = rawDomain.split('.');
    if (parts.length > 2) {
        // Sonderfall ccTLDs mit 2 Teilen (co.uk, com.au, etc.)
        const knownTwoPartTLDs = ['co.uk', 'org.uk', 'co.jp', 'com.au', 'co.nz', 'co.za', 'or.at'];
        const lastTwo = parts.slice(-2).join('.');
        if (knownTwoPartTLDs.includes(lastTwo)) {
            // news.bbc.co.uk → bbc.co.uk
            return parts.slice(-3).join('.');
        }
        // Normaler Fall: blog.example.com → example.com
        return parts.slice(-2).join('.');
    }

    return rawDomain;
}

/**
 * NEU: Berechnet den Diversity-Score nach dem Herfindahl-Hirschman-Index (HHI).
 *
 * Interpretation:
 * - 0.0 = Perfekte Diversität (jede Domain genau einmal)
 * - 1.0 = Monopol (eine Domain dominiert alles)
 *
 * @param {Array<Object>} results - Suchergebnisse mit 'url' Property
 * @param {number} topN - Nur die ersten N Ergebnisse bewerten (Standard: 10)
 * @returns {{ score: number, level: string, uniqueDomains: number, breakdown: Object }}
 */
function calculateDiversityScore(results, topN = 10) {
    const top = results.slice(0, topN);
    if (top.length === 0) return { score: 1.0, level: 'MONOPOL', uniqueDomains: 0, breakdown: {} };

    const counts = new Map();
    for (const item of top) {
        const id = getDiversityId(item.url);
        counts.set(id, (counts.get(id) || 0) + 1);
    }

    // HHI: Summe der quadratischen Marktanteile
    let hhi = 0;
    const breakdown = {};
    for (const [domain, count] of counts) {
        const share = count / top.length;
        hhi += share * share;
        breakdown[domain] = { count, sharePercent: Math.round(share * 100) };
    }

    // Normalisierung: minimal möglicher HHI bei N Domains = 1/N
    const minHHI = 1 / top.length;
    const normalizedHHI = Math.min(1, (hhi - minHHI) / (1 - minHHI + 0.0001));

    let level;
    if (normalizedHHI < 0.10) level = 'HOCH';
    else if (normalizedHHI < 0.25) level = 'GUT';
    else if (normalizedHHI < 0.45) level = 'MITTEL';
    else if (normalizedHHI < 0.65) level = 'NIEDRIG';
    else level = 'SEHR_NIEDRIG';

    return {
        score:         Math.round(normalizedHHI * 100) / 100,
        level,
        uniqueDomains: counts.size,
        totalResults:  top.length,
        breakdown
    };
}

/**
 * Gibt die optimalen Diversity-Limits für den erkannten Suchintent zurück.
 *
 * @param {string} intent - 'NEWS', 'COMMERCIAL', 'INFORMATIONAL', etc.
 * @returns {{ maxPerDomainTop10: number, maxPerDomainTotal: number, topSize: number }}
 */
function getOptionsForIntent(intent) {
    return INTENT_LIMITS[intent] || INTENT_LIMITS.DEFAULT;
}

// ─────────────────────────────────────────────────────────────────────────────
// KERN-FUNKTIONEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wendet den Diversity-Filter auf eine sortierte Ergebnisliste an.
 *
 * Gruppert Domains nach getDiversityId():
 * amazon.de + amazon.com = ein gemeinsamer Slot.
 *
 * @param {Array<Object>} results  - Sortiertes Array (muss 'url' haben)
 * @param {Object} options
 * @param {number}  options.topSize           - Größe der ersten Seite (Standard: 10)
 * @param {number}  options.maxPerDomainTop10 - Max. Slots pro Domain-Familie in Top-N (Standard: 3)
 * @param {number}  options.maxPerDomainTotal - Max. Slots pro Domain-Familie gesamt (Standard: 5)
 * @param {boolean} options.brandMode         - Brand-Suche → kein Diversity-Cap
 * @returns {{ results: Array<Object>, stats: Object }}
 */
function applyDomainDiversity(results, options = {}) {
    const topSize  = options.topSize            || 10;
    const maxTop   = options.maxPerDomainTop10  || 3;
    const maxTotal = options.maxPerDomainTotal  || 5;
    const brandMode = options.brandMode         || false;

    if (!Array.isArray(results) || results.length === 0) {
        return { results: [], stats: { filtered: 0, domains: {}, brandMode } };
    }

    // Brand-Modus: keine Einschränkung
    if (brandMode) {
        return { results, stats: { brandMode: true, filtered: 0, domains: {} } };
    }

    const domainCount  = new Map();   // diversityId → Gesamtanzahl
    const filteredItems = [];         // herausgefilterte Items (für Debug)
    const diversified   = [];         // finale Ergebnisliste

    for (const item of results) {
        const diversityId = getDiversityId(item.url);
        const count       = domainCount.get(diversityId) || 0;
        const position    = diversified.length;

        // Top-N Limit: Max maxTop Ergebnisse in den ersten topSize Positionen
        if (position < topSize && count >= maxTop) {
            filteredItems.push({ url: item.url, diversityId, reason: 'TOP_LIMIT' });
            continue;
        }

        // Gesamt-Limit: Max maxTotal Ergebnisse gesamt
        if (count >= maxTotal) {
            filteredItems.push({ url: item.url, diversityId, reason: 'TOTAL_LIMIT' });
            continue;
        }

        domainCount.set(diversityId, count + 1);
        diversified.push(item);
    }

    const domainStats = {};
    for (const [id, count] of domainCount) {
        domainStats[id] = count;
    }

    return {
        results: diversified,
        stats: {
            filtered:     filteredItems.length,
            filteredItems,
            domains:      domainStats,
            uniqueDomains: domainCount.size
        }
    };
}

/**
 * NEU: Erkennt Marken-Suchen (Brand Search) anhand der Query.
 * Query-basiert (NICHT Ergebnis-basiert) um Zirkularität zu vermeiden:
 * Hoher Trust → dominiert Top-20 → als "Brand" erkannt → kein Diversity-Cap
 * → bleibt dauerhaft dominant. Diese Logik bricht diesen Zirkel.
 *
 * @param {string} query - Die Suchanfrage
 * @param {Array<Object>} results - Aktuelle Ergebnisse (für Domain-Frequenz-Heuristik)
 * @returns {{ isBrand: boolean, brandDomain: string, reason: string }}
 */
function detectBrandSearch(query, results = []) {
    if (!query) return { isBrand: false, brandDomain: '', reason: '' };

    const q = query.toLowerCase().trim();

    // Regel 1: TLD direkt in der Query (z.B. "amazon.de Bücher", "bpb.de/coding")
    const tldMatch = q.match(/([a-z0-9-]+\.(de|com|org|net|at|ch|io|eu|gov|edu))\b/i);
    if (tldMatch) {
        return { isBrand: true, brandDomain: tldMatch[1], reason: 'TLD_IN_QUERY' };
    }

    // Regel 2: site:-Operator (z.B. "site:spiegel.de Corona")
    if (/^site:/i.test(q)) {
        const domain = q.replace(/^site:/i, '').trim().split(/[\s/]/)[0];
        return { isBrand: true, brandDomain: domain, reason: 'SITE_OPERATOR' };
    }

    // Regel 3: Dominante Domain-Familie im Query-Wort erkennbar
    // (z.B. "bpb Bildung" wenn bpb.de ≥5 Mal in Top 20 vorkommt)
    if (results.length >= 5) {
        const domainFreq = new Map();
        for (const r of results.slice(0, 20)) {
            const id = getDiversityId(r.url);
            if (id && id !== 'unknown') {
                domainFreq.set(id, (domainFreq.get(id) || 0) + 1);
            }
        }

        const sorted = [...domainFreq.entries()].sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
            const [topDomain, topCount] = sorted[0];
            const topDomainWord = topDomain.split('.')[0]; // 'wikipedia' aus 'wikipedia.org'
            const queryWords    = q.split(/\s+/);
            if (topDomainWord.length >= 3 && topCount >= 5 && queryWords.some(w => w === topDomainWord)) {
                return { isBrand: true, brandDomain: topDomain, reason: 'DOMAIN_WORD_IN_QUERY' };
            }
        }
    }

    return { isBrand: false, brandDomain: '', reason: '' };
}

/**
 * @deprecated Nutze detectBrandSearch() für strukturierten Rückgabewert.
 * Beibehaltung für Rückwärtskompatibilität mit altem Code.
 */
function isBrandSearch(results, thresholdRatio = 0.7) {
    if (!results || results.length < 5) return false;
    const checkCount = Math.min(results.length, 20);
    const counts = new Map();
    for (let i = 0; i < checkCount; i++) {
        const id = getDiversityId(results[i].url);
        counts.set(id, (counts.get(id) || 0) + 1);
    }
    for (const count of counts.values()) {
        if (count / checkCount >= thresholdRatio) return true;
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    // Kern-Funktionen
    applyDomainDiversity,
    detectBrandSearch,
    calculateDiversityScore,
    getOptionsForIntent,

    // Helper-Funktionen
    getDomain,
    getDiversityId,

    // Rückwärtskompatibilität
    isBrandSearch,

    // Konfiguration (für Tests und Erweiterungen)
    DOMAIN_FAMILIES,
    INTENT_LIMITS
};
