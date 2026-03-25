/**
 * AD-DENSITY MALUS ENGINE - v2.0
 * Teil des Luma Trust-Algorithmus
 *
 * KONZEPT: "Werbung verstärkt Kritik"
 * Verknüpft Werbemenge, Werbedichte und Nutzerkritik zu einem kombinierten Malus.
 * Je aggressiver die Werbestrategie einer Seite, desto stärker werden Dislikes gewichtet.
 *
 * LOGIK:
 * - Seite mit 0 Werbung + 30% Dislikes → Community-Modifier greift normal
 * - Seite mit 5 Bannern + 30% Dislikes → Frust-Multiplikator ×3.0 → stärkere Strafe
 * - Seite mit Popup + Video-Ad + 40% Dislikes → maximaler Multiplikator
 *
 * NEU IN v2.0:
 * - Popup / Interstitial-Erkennung (aggressiver als normale Banner)
 * - Video-Ad-Erkennung (automatisch abspielend = maximale Unterbrechung)
 * - Affiliate-Link-Dichte als eigenständige Metrik (getarnter Werbecontent)
 * - Paywall + Ads kombiniert = Doppel-Frust-Penalty
 * - Ad-Positionierung Above-the-Fold als Verstärker
 * - calculateAdFreeBonus() als dedizierte Bonus-Funktion (ersetzt inline-Logik in ranking.js)
 * - Vollständiges Breakdown-Objekt für Debug-Logging
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// KONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/** Maximaler kombinierter Malus aus diesem Modul (verhindert totale Score-Vernichtung) */
const MAX_MALUS = 30;

/** Minimum Community-Votes damit Dislike-Statistik aussagekräftig ist */
const MIN_VOTES = 5;

/** Minimum Dislike-Quote für Ad-Malus-Aktivierung (unter 20% = akzeptabel) */
const MIN_DISLIKE_RATIO = 0.20;

/** Maximaler Frust-Multiplikator (auch bei extremster Kombination) */
const MAX_MULTIPLIER = 5.0;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER-FUNKTIONEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Berechnet den Frust-Multiplikator basierend auf allen Werbe-Signalen.
 * Höherer Multiplikator = stärkere Verstärkung der Dislike-Strafe.
 *
 * Der Multiplikator setzt sich aus mehreren unabhängigen Stufen zusammen:
 * 1. Absolute Anzahl Banner-Ads
 * 2. Ad-Dichte (Ads pro 100 Wörter) — bestraft kurze, überfüllte Texte
 * 3. Popups & Interstitials (unterbrechen aktiv den Lesefluss)
 * 4. Video-Ads (automatisch abspielend = maximale Unterbrechung)
 * 5. Above-the-Fold-Positionierung (sofort sichtbar beim Laden)
 * 6. Paywall + Ads (Doppel-Frust: bezahlen UND Werbung)
 *
 * @param {Object} pageItem
 * @returns {{ multiplier: number, factors: Object }}
 */
function _calculateMultiplier(pageItem) {
    const adCount           = pageItem.adCount             || 0;
    const wordCount         = Math.max(pageItem.wordCount  || 1, 1);
    const popupCount        = pageItem.popupCount          || 0;
    const videoAdCount      = pageItem.videoAdCount        || 0;
    const adAboveFold       = pageItem.adPositionAboveFold || false;
    const hasPaywall        = pageItem.hasPaywall          || false;

    let multiplier = 1.0;
    const factors  = {};

    // ── Stufe 1: Absolute Banner-Anzahl ──
    if      (adCount >= 8) { multiplier += 2.0; factors.manyAds    = '+2.0'; }
    else if (adCount >= 5) { multiplier += 1.5; factors.highAds    = '+1.5'; }
    else if (adCount >= 3) { multiplier += 0.8; factors.medAds     = '+0.8'; }
    else if (adCount >= 1) { multiplier += 0.2; factors.someAds    = '+0.2'; }

    // ── Stufe 2: Ad-Dichte (Ads pro 100 Wörter) ──
    // Bestraft kurze Texte mit viel Werbung extra hart
    const adDensity = (adCount / wordCount) * 100;
    if      (adDensity > 2.0) { multiplier += 1.2; factors.veryHighDensity = `+1.2 (${adDensity.toFixed(1)}/100W)`; }
    else if (adDensity > 1.5) { multiplier += 1.0; factors.highDensity    = `+1.0 (${adDensity.toFixed(1)}/100W)`; }
    else if (adDensity > 0.8) { multiplier += 0.5; factors.medDensity     = `+0.5 (${adDensity.toFixed(1)}/100W)`; }

    // ── Stufe 3: Popups & Interstitials ──
    // Unterbrechen den Lesefluss → schwerer gewichtet als passive Banner
    if      (popupCount >= 2) { multiplier += 1.5; factors.manyPopups = '+1.5'; }
    else if (popupCount >= 1) { multiplier += 0.8; factors.popup      = '+0.8'; }

    // ── Stufe 4: Video-Ads (auto-play) ──
    // Maximale Unterbrechung durch automatisch abspielende Videos
    if      (videoAdCount >= 2) { multiplier += 1.0; factors.manyVideoAds = '+1.0'; }
    else if (videoAdCount >= 1) { multiplier += 0.5; factors.videoAd      = '+0.5'; }

    // ── Stufe 5: Above-the-Fold-Positionierung ──
    // Werbung die beim Laden sofort sichtbar ist, frustriert Nutzer am stärksten
    if (adAboveFold && (adCount + popupCount + videoAdCount) > 0) {
        multiplier += 0.5;
        factors.aboveFold = '+0.5';
    }

    // ── Stufe 6: Paywall + Ads = Doppel-Frust ──
    // Nutzer soll zahlen UND bekommt trotzdem Werbung
    if (hasPaywall && (adCount + videoAdCount) > 0) {
        multiplier += 0.8;
        factors.paywallWithAds = '+0.8';
    }

    return {
        multiplier: Math.min(multiplier, MAX_MULTIPLIER),
        factors
    };
}

/**
 * Basis-Dislike-Strafe (ohne Multiplikator).
 * Bildet die Grundlage für die Verstärkungs-Berechnung.
 *
 * @param {number} dislikeRatio - 0.0 bis 1.0
 * @returns {number}
 */
function _baseDislikePenalty(dislikeRatio) {
    if (dislikeRatio >= 0.80) return 15;
    if (dislikeRatio >= 0.60) return 10;
    if (dislikeRatio >= 0.40) return  6;
    if (dislikeRatio >= 0.20) return  3;
    return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// KERN-FUNKTIONEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Berechnet den kombinierten Ad-Density-Malus (Frust-Multiplikator).
 *
 * Dieser Malus ist ein ZUSÄTZLICHER Abzug on top des normalen Community-Modifiers.
 * Der Community-Modifier in ranking.js zieht bereits Punkte für Dislikes ab.
 * Dieser Malus verstärkt diese Strafe wenn gleichzeitig viel Werbung vorhanden ist.
 *
 * Formel:
 *   Gesamtwirkung  = basePenalty × multiplier
 *   Zusätz. Malus  = Gesamtwirkung − basePenalty  (nur der Mehrwert)
 *
 * @param {Object} pageItem
 *   adCount (number), wordCount (number), popupCount (number),
 *   videoAdCount (number), adPositionAboveFold (bool), hasPaywall (bool)
 * @param {Object} voteStats - { positive: number, negative: number }
 * @returns {{
 *   penalty:    number,
 *   multiplier: number,
 *   details:    string[],
 *   breakdown:  Object
 * }}
 */
function calculateAdDensityMalus(pageItem, voteStats) {
    if (!pageItem || !voteStats) {
        return { penalty: 0, multiplier: 1, details: [], breakdown: {} };
    }

    const adCount      = pageItem.adCount      || 0;
    const popupCount   = pageItem.popupCount   || 0;
    const videoAdCount = pageItem.videoAdCount || 0;
    const totalAdSignals = adCount + popupCount + videoAdCount;

    const positive   = voteStats.positive || 0;
    const negative   = voteStats.negative || 0;
    const totalVotes = positive + negative;

    // Keine Aktivierung ohne Werbung oder ohne ausreichend Votes
    if (totalAdSignals === 0 || totalVotes < MIN_VOTES) {
        return { penalty: 0, multiplier: 1, details: [], breakdown: {} };
    }

    const dislikeRatio = negative / totalVotes;

    // Keine Aktivierung bei weniger als 20% Dislikes
    if (dislikeRatio < MIN_DISLIKE_RATIO) {
        return { penalty: 0, multiplier: 1, details: [], breakdown: {} };
    }

    // Multiplikator berechnen
    const { multiplier, factors } = _calculateMultiplier(pageItem);

    // Basis-Strafe und Gesamtwirkung
    const baseDislike  = _baseDislikePenalty(dislikeRatio);
    const totalImpact  = baseDislike * multiplier;

    // Nur den ZUSÄTZLICHEN Malus durch die Werbung berechnen
    // (Basis-Strafe läuft bereits über Community-Modifier in ranking.js)
    const additionalMalus = Math.ceil(Math.max(0, totalImpact - baseDislike));
    const finalPenalty    = Math.min(additionalMalus, MAX_MALUS);

    const details = [];
    if (finalPenalty > 0) {
        const adParts = [
            adCount      > 0 ? `${adCount} Banner`     : null,
            popupCount   > 0 ? `${popupCount} Popup(s)` : null,
            videoAdCount > 0 ? `${videoAdCount} VideoAd(s)` : null,
        ].filter(Boolean).join(' + ');

        details.push(
            `Ad-Density Malus: ${adParts} ` +
            `bei ${Math.round(dislikeRatio * 100)}% Dislikes (${totalVotes} Votes)` +
            ` → Faktor ${multiplier.toFixed(1)}x → -${finalPenalty} Pkt`
        );
    }

    return {
        penalty:    finalPenalty,
        multiplier,
        details,
        breakdown: {
            adCount,
            popupCount,
            videoAdCount,
            dislikeRatioPercent:  Math.round(dislikeRatio * 100),
            totalVotes,
            baseDislikePenalty:   baseDislike,
            multiplierFactors:    factors,
            totalImpact:          Math.round(totalImpact),
            additionalMalus:      finalPenalty
        }
    };
}

/**
 * Berechnet den Werbefreiheits-Bonus einer Seite.
 *
 * Ersetzt die inline +4-Logik in ranking.js durch eine differenziertere Bewertung:
 * - Komplett werbefrei (kein Banner, kein Popup, kein VideoAd, kein Affiliate) → +5
 * - Minimale Werbung (max. 1 Banner, keine aggressiven Formate) → +2
 * - Sonst → 0 (Penalty läuft über den normalen Ad-Count in ranking.js)
 *
 * @param {Object} pageItem
 * @returns {{ bonus: number, reason: string }}
 */
function calculateAdFreeBonus(pageItem) {
    if (!pageItem) return { bonus: 0, reason: '' };

    const adCount        = pageItem.adCount             || 0;
    const popupCount     = pageItem.popupCount          || 0;
    const videoAdCount   = pageItem.videoAdCount        || 0;
    const affiliateLinks = pageItem.affiliateLinkCount  || 0;
    const hasPaywall     = pageItem.hasPaywall          || false;

    // Völlig werbefrei — alle Signale null
    if (adCount === 0 && popupCount === 0 && videoAdCount === 0 && affiliateLinks === 0 && !hasPaywall) {
        return { bonus: 5, reason: 'Komplett werbefrei (kein Banner, Popup, VideoAd oder Affiliate)' };
    }

    // Minimale, nicht-aggressive Werbung
    if (adCount <= 1 && popupCount === 0 && videoAdCount === 0) {
        return { bonus: 2, reason: 'Minimale Werbung (max. 1 Banner, keine Popups/VideoAds)' };
    }

    return { bonus: 0, reason: '' };
}

/**
 * Berechnet den Affiliate-Link-Dichte-Malus.
 *
 * Zu viele Affiliate-Links signalisieren kommerziellen Bias:
 * Der Content ist getarnter Werbecontent ohne echten Mehrwert für den Nutzer.
 * Schwellwert: Absolute Anzahl ODER Dichte (Links pro 100 Wörter).
 *
 * @param {Object} pageItem - affiliateLinkCount (number), wordCount (number)
 * @returns {{ penalty: number, details: string[] }}
 */
function calculateAffiliateDensityMalus(pageItem) {
    if (!pageItem) return { penalty: 0, details: [] };

    const affiliateLinks  = pageItem.affiliateLinkCount || 0;
    const wordCount       = Math.max(pageItem.wordCount || 1, 1);
    const details         = [];

    if (affiliateLinks === 0) return { penalty: 0, details: [] };

    const affiliateDensity = (affiliateLinks / wordCount) * 100;

    let penalty = 0;

    if (affiliateLinks >= 20 || affiliateDensity > 2.0) {
        penalty = 8;
        details.push(
            `Affiliate-Überdichte: ${affiliateLinks} Links (${affiliateDensity.toFixed(1)}/100W)` +
            ` → Content-Qualität zweifelhaft → -${penalty} Pkt`
        );
    } else if (affiliateLinks >= 10 || affiliateDensity > 1.0) {
        penalty = 5;
        details.push(
            `Hohe Affiliate-Dichte: ${affiliateLinks} Links (${affiliateDensity.toFixed(1)}/100W)` +
            ` → -${penalty} Pkt`
        );
    } else if (affiliateLinks >= 5 || affiliateDensity > 0.5) {
        penalty = 2;
        details.push(
            `Erhöhte Affiliate-Links: ${affiliateLinks} → -${penalty} Pkt`
        );
    }

    return { penalty, details };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
    // Kern-Funktionen
    calculateAdDensityMalus,
    calculateAdFreeBonus,
    calculateAffiliateDensityMalus,

    // Interne Helpers (für Tests)
    _calculateMultiplier,
    _baseDislikePenalty,

    // Konfiguration
    MAX_MALUS,
    MAX_MULTIPLIER,
    MIN_VOTES,
    MIN_DISLIKE_RATIO
};
