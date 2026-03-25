/**
 * CONTENT VALIDATOR
 * Kombiniert alle Moderationsmodule zu einer einzigen Prüfpipeline.
 *
 * Reihenfolge der Prüfungen:
 *  1. Grundlegende Eingabe-Validierung
 *  2. Spam-Erkennung (Länge, URLs, Caps, Wiederholungen)
 *  3. Schimpfwort-Filter (Beleidigungen, Hassrede)
 *  4. Duplikat-Erkennung (Copy-Paste, plagiierter Inhalt)
 *
 * Verwendung:
 *  const { validateContent, confirmContent } = require('./content-validator');
 *
 *  // Vor dem Speichern prüfen:
 *  const result = validateContent({ title, description }, 'list');
 *  if (!result.ok) return res.status(400).json({ error: result.reason });
 *
 *  // Nach erfolgreichem Speichern registrieren (Duplikat-Cache):
 *  confirmContent({ title, description }, 'list');
 */

'use strict';

const { checkAIModeration }  = require('./ai-moderation');
const { checkInsults }       = require('./insult-detector');
const { checkSpam }          = require('./spam-detector');
const { checkDuplicate, registerText } = require('./duplicate-detector');

// ============================================================
// FELDKONFIGURATION
// ============================================================

/**
 * Definiert welche Felder für welchen Content-Typ geprüft werden
 * und mit welchem Spam-Feld-Alias.
 */
const FIELD_MAP = {
    list: [
        { key: 'title',       spamField: 'listTitle',       required: true  },
        { key: 'description', spamField: 'listDescription',  required: false },
    ],
    item: [
        { key: 'content',     spamField: 'itemContent',     required: true  },
    ],
    comment: [
        { key: 'content',     spamField: 'comment',         required: true  },
    ],
};

// ============================================================
// HAUPTFUNKTION
// ============================================================

/**
 * Validiert Inhalte gegen alle Moderationsregeln.
 *
 * @param {Object} data         — { title, description, content, ... }
 * @param {'list'|'item'|'comment'} type — Art des Inhalts
 * @param {string} [scope]      — Duplikat-Scope (z.B. 'lists', 'items-42')
 * @returns {Promise<{ ok: boolean, reason: string|null, field: string|null }>}
 */
async function validateContent(data, type = 'item', scope = type) {
    const fields = FIELD_MAP[type];
    if (!fields) {
        return { ok: false, reason: `Unbekannter Content-Typ: ${type}`, field: null };
    }

    for (const { key, spamField, required } of fields) {
        const value = data[key];

        // Pflichtfelder prüfen
        if (required && (!value || !value.trim())) {
            return {
                ok: false,
                reason: `Das Feld "${key}" darf nicht leer sein.`,
                field: key,
            };
        }

        if (!value || !value.trim()) continue; // Optionales leeres Feld: überspringen

        const text = value.trim();

        // 1. Spam-Prüfung
        const spamResult = checkSpam(text, spamField);
        if (!spamResult.ok) {
            return { ok: false, reason: spamResult.reason, field: key };
        }

        // 2. DIREKTE INSULTE (schnelle Wort-Filter für offensichtliche Beleidigungen)
        const insultResult = checkInsults(text);
        if (insultResult.blocked) {
            return { ok: false, reason: `❌ ${insultResult.grund}`, field: key };
        }
        if (insultResult.geflaggt) {
            console.log(`⚠️  [FLAG] Insult zur Überprüfung: "${text.substring(0, 60)}" — ${insultResult.grund}`);
        }

        // 3. AI-Moderation (semantisch intelligent für subtilere Fälle)
        const aiResult = await checkAIModeration(text, 'system-validator');
        if (aiResult.blocked) {
            return { ok: false, reason: `❌ ${aiResult.grund}`, field: key };
        }
        if (aiResult.geflaggt) {
            // Geflaggte Inhalte werden NUR geloggt, nicht blockiert
            console.log(`⚠️  [FLAG] Inhalt zur Überprüfung: "${text.substring(0, 60)}" — ${aiResult.grund}`);
        }

        // 3. Duplikat-Prüfung (nur für Pflichtfelder)
        if (required) {
            const dupResult = checkDuplicate(text, `${scope}:${key}`);
            if (dupResult.isDuplicate) {
                return { ok: false, reason: dupResult.reason, field: key };
            }
        }
    }

    return { ok: true, reason: null, field: null };
}

/**
 * Registriert akzeptierten Content im Duplikat-Detector.
 * Muss NACH erfolgreichem Speichern aufgerufen werden.
 *
 * @param {Object} data
 * @param {'list'|'item'|'comment'} type
 * @param {string} [scope]
 */
function confirmContent(data, type = 'item', scope = type) {
    const fields = FIELD_MAP[type] || [];
    for (const { key, required } of fields) {
        const value = data[key];
        if (required && value && value.trim()) {
            registerText(value.trim(), `${scope}:${key}`);
        }
    }
}

// ============================================================
// MIDDLEWARE-FACTORY für Express
// ============================================================

/**
 * Erstellt eine Express-Middleware die POST-Body-Felder validiert.
 *
 * @param {'list'|'item'|'comment'} type
 * @param {string} [scope]
 */
function moderationMiddleware(type, scope) {
    return async (req, res, next) => {
        const result = await validateContent(req.body, type, scope || type);
        if (!result.ok) {
            return res.status(400).json({
                error: 'Inhalt abgelehnt',
                message: result.reason,
                field: result.field,
            });
        }
        // Validierten Content für spätere Registrierung merken
        req._moderationType  = type;
        req._moderationScope = scope || type;
        next();
    };
}

// ============================================================
// EXPORT
// ============================================================

module.exports = { validateContent, confirmContent, moderationMiddleware };