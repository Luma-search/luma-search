/**
 * SPAM DETECTOR
 * Erkennt Spam-Muster in Community-Inhalten
 *
 * Prüft auf:
 *  - Zu viele Links / URLs
 *  - Wiederholende Zeichenmuster (aaaa, !!!, ...)
 *  - Übermäßige Großschreibung (SCHREIEN)
 *  - Zu kurze / sinnlose Inhalte
 *  - Zu viele Sonderzeichen
 *  - Bekannte Spam-Phrasen
 *  - Zu viele Emojis
 */

'use strict';

// ============================================================
// KONFIGURATION
// ============================================================

const CONFIG = {
    /** Maximale Anzahl von URLs im Text */
    maxUrls: 2,

    /** Maximale Anzahl von Emojis */
    maxEmojis: 8,

    /** Maximal erlaubter Anteil von Großbuchstaben (0–1) */
    maxUppercaseRatio: 0.6,

    /** Mindestlänge eines Textes (in Zeichen) */
    minLength: {
        listTitle: 5,
        listDescription: 20,
        itemContent: 10,
        comment: 5,
    },

    /** Maximale Länge */
    maxLength: {
        listTitle: 200,
        listDescription: 2000,
        itemContent: 1000,
        comment: 500,
    },

    /** Max. Anteil Sonderzeichen am Gesamttext */
    maxSpecialCharRatio: 0.35,

    /** Max. erlaubte Wiederholungen eines Zeichens hintereinander */
    maxCharRepeat: 4,
};

// ============================================================
// SPAM-PHRASEN
// ============================================================

const SPAM_PHRASES = [
    // Werbung / Marketing
    'klick hier', 'click here', 'jetzt kaufen', 'buy now',
    'gratis', 'kostenlos verdienen', 'earn money', 'make money fast',
    'work from home', 'von zuhause verdienen',
    'angebot nur heute', 'limited time offer',
    'whatsapp mich', 'dm me', 'schreib mir',
    // Ketten / Hoaxes
    'teile das', 'share this', 'weiterleiten', 'forward this',
    'wenn du das nicht teilst', 'if you don\'t share',
    // Irreführende Inhalte
    '100% garantiert', '100% guaranteed', 'kein risiko', 'no risk',
    'schnell reich', 'get rich quick',
];

// ============================================================
// REGEX-MUSTER
// ============================================================

const URL_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
const EMOJI_REGEX = /[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
const REPEATING_CHAR_REGEX = /(.)\1{4,}/; // 5+ gleiche Zeichen hintereinander
const SPECIAL_CHAR_REGEX = /[^a-zA-Z0-9äöüÄÖÜß\s.,!?;:()\-'"]/g;

// ============================================================
// HAUPTFUNKTION
// ============================================================

/**
 * Analysiert einen Text auf Spam-Muster.
 *
 * @param {string} text     — der zu prüfende Text
 * @param {string} [field]  — Feldname für Längen-Prüfung ('listTitle', 'itemContent', etc.)
 * @returns {{ ok: boolean, reason: string|null, issues: string[] }}
 */
function checkSpam(text, field = 'itemContent') {
    if (!text || typeof text !== 'string') {
        return { ok: false, reason: 'Leerer Inhalt ist nicht erlaubt.', issues: ['empty'] };
    }

    const trimmed = text.trim();
    const issues = [];

    // --- Länge prüfen ---
    const minLen = CONFIG.minLength[field] ?? 5;
    const maxLen = CONFIG.maxLength[field] ?? 2000;

    if (trimmed.length < minLen) {
        issues.push('too_short');
    }
    if (trimmed.length > maxLen) {
        issues.push('too_long');
    }

    // --- URLs zählen ---
    const urls = trimmed.match(URL_REGEX) || [];
    if (urls.length > CONFIG.maxUrls) {
        issues.push('too_many_urls');
    }

    // --- Emojis zählen ---
    const emojis = trimmed.match(EMOJI_REGEX) || [];
    if (emojis.length > CONFIG.maxEmojis) {
        issues.push('too_many_emojis');
    }

    // --- Großbuchstaben-Anteil (nur wenn Text > 10 Zeichen) ---
    if (trimmed.length > 10) {
        const letters = trimmed.replace(/[^a-zA-ZäöüÄÖÜ]/g, '');
        if (letters.length > 0) {
            const upperCount = (letters.match(/[A-ZÄÖÜ]/g) || []).length;
            const ratio = upperCount / letters.length;
            if (ratio > CONFIG.maxUppercaseRatio) {
                issues.push('excessive_caps');
            }
        }
    }

    // --- Wiederholende Zeichen ---
    if (REPEATING_CHAR_REGEX.test(trimmed)) {
        issues.push('repeating_chars');
    }

    // --- Sonderzeichen-Anteil ---
    const specialChars = trimmed.match(SPECIAL_CHAR_REGEX) || [];
    const specialRatio = specialChars.length / trimmed.length;
    if (trimmed.length > 10 && specialRatio > CONFIG.maxSpecialCharRatio) {
        issues.push('too_many_special_chars');
    }

    // --- Spam-Phrasen ---
    const lower = trimmed.toLowerCase();
    for (const phrase of SPAM_PHRASES) {
        if (lower.includes(phrase)) {
            issues.push('spam_phrase');
            break;
        }
    }

    // --- Ergebnis ---
    if (issues.length === 0) {
        return { ok: true, reason: null, issues: [] };
    }

    const reason = buildReason(issues, field);
    return { ok: false, reason, issues };
}

/**
 * Erstellt eine lesbare Fehlermeldung aus den erkannten Problemen
 */
function buildReason(issues, field) {
    const messages = {
        too_short: `Der Text ist zu kurz (mind. ${CONFIG.minLength[field] ?? 5} Zeichen).`,
        too_long: `Der Text ist zu lang (max. ${CONFIG.maxLength[field] ?? 2000} Zeichen).`,
        too_many_urls: `Bitte füge maximal ${CONFIG.maxUrls} Link(s) ein.`,
        too_many_emojis: 'Zu viele Emojis – bitte reduziere sie.',
        excessive_caps: 'Bitte schreibe nicht alles in GROSSBUCHSTABEN.',
        repeating_chars: 'Wiederholende Zeichen (z.B. "aaaaa") sind nicht erlaubt.',
        too_many_special_chars: 'Der Text enthält zu viele Sonderzeichen.',
        spam_phrase: 'Dein Text enthält Inhalte, die wie Werbung oder Spam wirken.',
    };

    return issues
        .map(i => messages[i] ?? 'Ungültiger Inhalt.')
        .join(' ');
}

// ============================================================
// EXPORT
// ============================================================

module.exports = { checkSpam, SPAM_CONFIG: CONFIG };
