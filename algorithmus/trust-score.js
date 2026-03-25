/**
 * LUMA — TRUST-SCORE ENGINE v2
 *
 * Berechnet Vertrauenswürdigkeit einer Seite aus DB-Werten.
 *
 * WICHTIG — Autor-Logik:
 *  Dieser Code enthält KEINE hardcodierten Autoren-Listen.
 *  Der Crawler (autor-klassifizierer.js) hat den Autor bereits klassifiziert
 *  und als item.autorTyp in der DB gespeichert.
 *  Trust-Score liest nur noch: item.autorTyp → Punkte.
 *
 * SCORING (max 100):
 *  1. E-A-T Basis         max 25  (vom Crawler berechnet, aus eat_score Spalte)
 *  2. Content-Qualität    max 25  (Lesbarkeit, Tiefe, Autor-Typ, Schema.org)
 *  3. Technische Qualität max 15  (HTTPS, Mobile, Speed)
 *  4. Community-Signale   max 20  (Votes, CTR, Verweilzeit)
 *  5. Domain-Properties   max 15  (Alter, Trust)
 *  Malus                  bis -30 (Ads, Paywall)
 *
 * TRUST LEVELS:
 *  VERY_HIGH (80-100) | HIGH (60-79) | MEDIUM (40-59) | LOW (20-39) | VERY_LOW (0-19)
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AUTOR-TYP → PUNKTE
// Einzige autor-bezogene Logik hier — alles andere ist in autor-klassifizierer.js
// ─────────────────────────────────────────────────────────────────────────────

const AUTOR_SCORES = {
    agentur:    10,  // dpa, afp, reuters etc.
    journalist:  8,  // Vorname Nachname
    redaktion:   2,  // "Redaktion xyz", Kürzel
    kein_autor:  0,  // kein Autor gefunden / Shop-Seite etc.
};

// ─────────────────────────────────────────────────────────────────────────────
// HILFSFUNKTIONEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bewertet Schema.org Vollständigkeit.
 * Vollständige strukturierte Daten = Sorgfalt des Publishers.
 */
function bewerteSchemaVollstaendigkeit(item) {
    let punkte = 0;
    if (item.schemaType && item.schemaType !== 'null') punkte += 2;
    if (item.author && item.author.length > 2)         punkte += 2;
    if (item.publishedDate || item.veroeffentlichtAm)  punkte += 2;
    if (item.schemaRatingValue > 0 && item.schemaRatingCount > 0) punkte += 2;
    return Math.min(8, punkte);
}

/**
 * Bewertet inhaltliche Tiefe: Wortanzahl, Bilder, Struktur.
 */
function bewerteContentTiefe(item) {
    let punkte = 0;

    const wortAnzahl = item.wordCount || item.wortAnzahl || 0;
    if      (wortAnzahl >= 1500) punkte += 5;
    else if (wortAnzahl >= 800)  punkte += 4;
    else if (wortAnzahl >= 400)  punkte += 3;
    else if (wortAnzahl >= 200)  punkte += 1;

    const bilder = item.imageCount || item.bilderAnzahl || 0;
    if      (bilder >= 5) punkte += 3;
    else if (bilder >= 2) punkte += 2;
    else if (bilder >= 1) punkte += 1;

    if (item.faq && item.faq.length > 0) punkte += 2;
    if (item.hasTable)                   punkte += 1;
    if (item.hasSteps)                   punkte += 1;

    return Math.min(12, punkte);
}

/**
 * Bewertet Community-Signale: Votes + CTR + Verweilzeit.
 * Votes haben mehr Gewicht weil sie explizite Nutzer-Meinungen sind.
 */
function bewerteCommunitySig(item) {
    let punkte = 0;

    // ── VOTES: kein globaler Einfluss mehr ────────────────────────────────
    // Votes existieren global in der DB (jeder sieht die Zahlen),
    // aber sie beeinflussen das Ranking NUR personalisiert über getUserInterests()
    // in ranking.js (+3 für gelikte Domain, +2 für gelikte Kategorie).
    //
    // Warum: Globale Vote-Rankings führen zu einer Filter-Bubble —
    // 10 Seiten stehen für alle immer oben, Millionen guter neuer Seiten
    // kommen nie nach oben. Jeder Nutzer soll seine eigene Rangliste haben.
    //
    // Votes fließen hier also NICHT ein. Sie bleiben aber gespeichert
    // damit getUserInterests() sie personalisiert auswerten kann.

    // CTR: aggregiertes Signal — wie oft wird diese Seite angeklickt
    // Das ist kein persönlicher Vote, sondern kollektives Nutzungsverhalten
    const ctr = item.ctr || 0;
    if      (ctr >= 8) punkte += 3;
    else if (ctr >= 5) punkte += 2;
    else if (ctr >= 2) punkte += 1;

    // Verweilzeit: Nutzer bleibt auf der Seite = Inhalt war hilfreich
    const dwellTime = item.dwellTime || 0;
    if      (dwellTime >= 180000) punkte += 5;
    else if (dwellTime >= 60000)  punkte += 3;
    else if (dwellTime >= 20000)  punkte += 1;

    return Math.min(8, Math.max(0, punkte));
}

// ─────────────────────────────────────────────────────────────────────────────
// HAUPT-FUNKTION
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {

    calculateTrustScore: function(item) {
        const DEBUG   = process.env.DEBUG_TRUST_SCORE === 'true';
        let trustScore = 0;
        const factors  = {};

        if (DEBUG) console.log(`   [TrustScore v2] URL: ${item.url?.slice(0, 50)}`);

        // ══════════════════════════════════════════════════════════════
        // 1. E-A-T BASIS (max 25)
        // Roher E-A-T Score vom Crawler — gespeichert in eat_score Spalte.
        // Enthält: Impressum, Datenschutz, Kontakt, Schema.org, Domain-Autorität.
        // ══════════════════════════════════════════════════════════════

        const eatScore  = item.eatScore || 0;
        const eatPoints = (eatScore / 100) * 25;
        trustScore     += eatPoints;
        factors.eat     = parseFloat(eatPoints.toFixed(1));

        // ══════════════════════════════════════════════════════════════
        // 2. CONTENT-QUALITÄT (max 25)
        // ══════════════════════════════════════════════════════════════

        // 2a. Lesbarkeit (max 6)
        const readPoints    = (item.readabilityScore || 50) / 100 * 6;
        trustScore         += readPoints;
        factors.readability = parseFloat(readPoints.toFixed(1));

        // 2b. Text-zu-Code-Verhältnis (max 4, min -2)
        let textRatioPoints = 0;
        const textRatio     = item.textToCodeRatio || 0;
        if      (textRatio >= 0.40) textRatioPoints =  4;
        else if (textRatio >= 0.25) textRatioPoints =  3;
        else if (textRatio >= 0.10) textRatioPoints =  1;
        else if (textRatio <  0.05) textRatioPoints = -2; // Fast nur Code/Ads
        trustScore        += textRatioPoints;
        factors.textRatio  = textRatioPoints;

        // 2c. Content-Tiefe (max 12)
        const contentPoints  = bewerteContentTiefe(item);
        trustScore          += contentPoints;
        factors.contentDepth = contentPoints;

        // 2d. Autor-Typ (max 10)
        // Liest NUR item.autorTyp aus der DB — keine eigene Klassifizierung hier.
        // Klassifizierung passiert ausschließlich in autor-klassifizierer.js.
        const autorTyp     = item.autorTyp || item.autor_typ || 'kein_autor';
        const autorScore   = AUTOR_SCORES[autorTyp] ?? 0;
        trustScore        += autorScore;
        factors.autorScore = autorScore;
        factors.autorTyp   = autorTyp;

        // 2e. Schema.org Vollständigkeit (max 8)
        const schemaPoints  = bewerteSchemaVollstaendigkeit(item);
        trustScore         += schemaPoints;
        factors.schemaScore = schemaPoints;

        if (DEBUG) console.log(`   Content: Read=${readPoints.toFixed(1)} Tiefe=${contentPoints} Autor=${autorTyp}(+${autorScore}) Schema=${schemaPoints}`);

        // ══════════════════════════════════════════════════════════════
        // 3. TECHNISCHE QUALITÄT (max 15)
        // ══════════════════════════════════════════════════════════════

        let techPoints = 0;
        if (item.isSecure)                                  techPoints += 7;
        if (item.isMobileFriendly)                          techPoints += 5;
        if (item.loadSpeed && item.loadSpeed < 1000)        techPoints += 3;
        else if (item.loadSpeed && item.loadSpeed < 2500)   techPoints += 1;

        trustScore       += Math.min(15, techPoints);
        factors.technical = Math.min(15, techPoints);

        // ══════════════════════════════════════════════════════════════
        // 4. COMMUNITY-SIGNALE (max 20, min -10)
        // ══════════════════════════════════════════════════════════════

        const communityPoints = bewerteCommunitySig(item);
        trustScore           += communityPoints;
        factors.community     = communityPoints;

        // ══════════════════════════════════════════════════════════════
        // 5. DOMAIN-PROPERTIES (max 15)
        // ══════════════════════════════════════════════════════════════

        // 5a. Domain-Trust vom Crawler (max 10)
        const domTrustPoints = (item.domainTrust || 0) * 10;
        trustScore          += domTrustPoints;
        factors.domainTrust  = parseFloat(domTrustPoints.toFixed(1));

        // 5b. Domain-Alter (max 5) — kleiner Stabilitäts-Bonus, kein Malus für neue Seiten
        let agePoints = 0;
        const domainAge = item.domainAge || 0;
        if      (domainAge > 10) agePoints = 5;
        else if (domainAge > 5)  agePoints = 4;
        else if (domainAge > 3)  agePoints = 3;
        else if (domainAge > 1)  agePoints = 2;
        else if (domainAge > 0.5) agePoints = 1;
        trustScore      += agePoints;
        factors.domainAge = agePoints;

        // ══════════════════════════════════════════════════════════════
        // MALUS (bis -30)
        // ══════════════════════════════════════════════════════════════

        let malus = 0;

        // Zu viele Werbe-URLs
        if (item.adUrlCount >= 5) {
            malus -= Math.min(15, item.adUrlCount - 5);
        }

        // Paywall
        if (item.isPaywall || item.istPaywall) {
            malus -= Math.round((item.paywallConfidence || 0.5) * 10);
        }

        // Thin Content + viel Werbung = Spam-Signal
        if ((item.wordCount || 0) < 100 && (item.adUrlCount || 0) > 3) {
            malus -= 5;
        }

        trustScore   += malus;
        factors.malus = malus;

        // ══════════════════════════════════════════════════════════════
        // FINALE BERECHNUNG
        // ══════════════════════════════════════════════════════════════

        const finalScore = Math.min(100, Math.max(0, trustScore));

        let trustLevel = 'VERY_LOW';
        if      (finalScore >= 80) trustLevel = 'VERY_HIGH';
        else if (finalScore >= 60) trustLevel = 'HIGH';
        else if (finalScore >= 40) trustLevel = 'MEDIUM';
        else if (finalScore >= 20) trustLevel = 'LOW';

        if (DEBUG) console.log(`   FINAL: ${finalScore.toFixed(1)} → ${trustLevel} | ${JSON.stringify(factors)}`);

        return {
            trustScore: Math.round(finalScore),
            trustLevel,
            factors,
            breakdown: this.getBreakdown(finalScore, factors),
            badge:     this.getTrustBadge(finalScore),
        };
    },

    getBreakdown: function(score, factors) {
        const parts = [];
        if (factors.eat        > 0)  parts.push(`EAT ${factors.eat}`);
        if (factors.readability > 0) parts.push(`Read ${factors.readability}`);
        if (factors.contentDepth > 0) parts.push(`Inhalt ${factors.contentDepth}`);
        if (factors.autorTyp)         parts.push(`Autor:${factors.autorTyp}(+${factors.autorScore})`);
        if (factors.schemaScore > 0)  parts.push(`Schema ${factors.schemaScore}`);
        if (factors.technical > 0)    parts.push(`Tech ${factors.technical}`);
        if (factors.community !== 0)  parts.push(`Community ${factors.community}`);
        if (factors.domainTrust > 0)  parts.push(`Domain ${factors.domainTrust}`);
        if (factors.domainAge > 0)    parts.push(`Alter ${factors.domainAge}`);
        if (factors.malus < 0)        parts.push(`Malus ${factors.malus}`);
        return `Score ${Math.round(score)} [${parts.join(' | ')}]`;
    },

    getTrustBadge: function(trustScore) {
        if (trustScore >= 80) return { label: '✓✓ Sehr vertrauenswürdig', color: '#22c55e', bgColor: '#dcfce7' };
        if (trustScore >= 60) return { label: '✓ Vertrauenswürdig',        color: '#3b82f6', bgColor: '#dbeafe' };
        if (trustScore >= 40) return { label: '⚠️ Warnung',                color: '#f59e0b', bgColor: '#fef3c7' };
        return                       { label: '✗ Blockiert',               color: '#ef4444', bgColor: '#fee2e2' };
    },
};