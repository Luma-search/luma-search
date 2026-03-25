/**
 * COMMUNITY MODERATION — Hauptexport
 *
 * Einstiegspunkt für das Moderationsmodul.
 * Importiere von hier, nicht direkt aus den Untermodulen.
 *
 * Schnellstart:
 *   const { validateContent, confirmContent, moderationMiddleware } =
 *       require('./modules/community-moderation');
 *
 * Alle Exporte:
 *   validateContent(data, type, scope)  — Prüft Inhalte inkl. AI-Moderation (async!)
 *   confirmContent(data, type, scope)   — Registriert akzeptierten Inhalt im Dup-Cache
 *   moderationMiddleware(type, scope)   — Express-Middleware-Factory (DEPRECATED - nutze AI-Mod direkt)
 *   checkSpam(text, field)              — Nur Spam-Prüfung
 *   checkDuplicate(text, scope)         — Nur Duplikat-Prüfung
 *   registerText(text, scope)           — Text im Dup-Cache speichern
 * 
 * HINWEIS: bad-words-filter.js wurde durch AI-Moderation ersetzt (semantisch intelligent)
 */

'use strict';

const { validateContent, confirmContent, moderationMiddleware } =
    require('./content-validator');

const { checkSpam, SPAM_CONFIG } =
    require('./spam-detector');

const { checkDuplicate, registerText, clearStore: clearDupStore } =
    require('./duplicate-detector');

module.exports = {
    // Haupt-API
    validateContent,
    confirmContent,
    moderationMiddleware,

    // Einzelne Prüfungen (für Tests / feingranulare Kontrolle)
    checkSpam,
    checkDuplicate,
    registerText,

    // Hilfsfunktionen
    SPAM_CONFIG,

    // Nur für Tests
    clearDupStore,
};
