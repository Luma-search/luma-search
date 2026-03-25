'use strict';

/**
 * Dynamische Gewichtsprofile je nach Such-Intent.
 * Ersetzt die statischen Gewichte 40/35/25 in ranking.js.
 */

const WEIGHT_PROFILES = {
    YMYL:          { trust: 60, relevance: 25, quality: 15 },
    NEWS:          { trust: 30, relevance: 30, quality: 15, freshness: 25 },
    COMMERCIAL:    { trust: 30, relevance: 40, quality: 30 },
    ENTERTAINMENT: { trust: 20, relevance: 40, quality: 40 },
    INFORMATIONAL: { trust: 35, relevance: 35, quality: 30 },
    DEFAULT:       { trust: 40, relevance: 35, quality: 25 },
};

// Queries die hohe Trust-Priorität erfordern (YMYL: Your Money Your Life)
const YMYL_PATTERN = /\b(arzt|doktor|krankheit|symptom|medikament|diagnose|therapie|kredit|hypothek|steuer|rechtsanwalt|anwalt|klage|versicherung|impfung|allergie|depression|diabetes|krebs|herzinfarkt|schlaganfall|notfall|apotheke|krankenhaus|operation|chirurg|heilmittel|nebenwirkung|dosierung|aktien|fonds|rente|altersvorsorge|insolvenz|konkurs|schulden|pflegegeld|erbe|testament)\b/i;

// Auto/Fahrzeug-Suchen → COMMERCIAL: Relevanz wichtiger als Trust
const AUTO_PATTERN = /\b(auto|autos|pkw|fahrzeug|gebrauchtwagen|neuwagen|kfz|motorrad|elektroauto|leasing|autohaus|autokauf|cabrio|limousine|suv|kombi)\b/i;

/**
 * Gibt die passenden Gewichte für Intent + Query zurück.
 * YMYL überschreibt alle anderen Intents.
 */
function getWeights(intent, query) {
    if (YMYL_PATTERN.test(query)) return WEIGHT_PROFILES.YMYL;
    if (AUTO_PATTERN.test(query)) return WEIGHT_PROFILES.COMMERCIAL; // Auto → Relevanz wichtiger
    return WEIGHT_PROFILES[intent] || WEIGHT_PROFILES.DEFAULT;
}

module.exports = { getWeights, WEIGHT_PROFILES };