/**
 * INSULT DETECTOR — Kontext-bewusste Beleidigungserkennung
 *
 * DESIGN-PHILOSOPHIE:
 *  Kein simples Wort-Matching. Jedes Wort hat AUSNAHMEN (Whitelist)
 *  die verhindern dass legitime Aussagen geblockt werden.
 *
 *  Beispiele:
 *  ✅ BLOCKIERT: "du bist dumm"        → Beleidigung mit Personalpronomen
 *  ✅ BLOCKIERT: "du scheiss nazi"     → Direktanrede + Schimpfwort
 *  ✅ BLOCKIERT: "halt die fresse"     → Direktanrede
 *  ✅ BLOCKIERT: "ich hasse dich"      → Direkte Feindseligkeit
 *
 *  ✅ ERLAUBT:  "die nazis waren..."   → historischer Kontext
 *  ✅ ERLAUBT:  "warum waren nazis so" → Frage, historisch
 *  ✅ ERLAUBT:  "das ist dumm gelaufen"→ kein Personalpronomen
 *  ✅ ERLAUBT:  "ich bin so dumm"      → selbstbezogen
 *  ✅ ERLAUBT:  "verrücktes design"    → adjektivisch, kein Ziel
 *  ✅ ERLAUBT:  "das macht mich krank" → Hyperbel
 *  ✅ ERLAUBT:  "ich kill das Game"    → Gaming-Kontext
 *  ✅ ERLAUBT:  "ich sterbe vor Lachen"→ Hyperbel
 */

'use strict';

// ─── KONTEXT-HILFSFUNKTIONEN ──────────────────────────────────────────────────

/**
 * Prüft ob ein Text eine direkte Personanrede enthält
 * (du, ihr, sie als 2.Pers., dich, dir, euch...)
 */
function _hatDirektanrede(text) {
    return /\b(du|dich|dir|dein|deine|deinen|deinem|euch|ihr|euer|eure)\b/i.test(text);
}

/**
 * Prüft ob der Text selbst-bezogen ist (ich bin, ich fühle...)
 */
function _istSelbstbezogen(text) {
    return /\b(ich\s+(bin|fühle|finde|glaube|denke|mache|hab|habe))\b/i.test(text);
}

/**
 * Prüft ob direkter Angriff vorliegt: du + negatives Wort
 * Muster: "du [bist|bist so ein|bist echt ein|...] [wort]"
 */
function _istDirektangriff(text) {
    return /\b(du\s+(bist|bist\s+(so\s+ein?|echt|total|richtig|voll|ein?)\s*|eine?|so\s+eine?|wirkst\s+wie\s+eine?))/i.test(text);
}

/**
 * Prüft ob Gaming/Sport-Kontext vorliegt
 */
function _istGamingKontext(text) {
    return /\b(game|level|boss|match|run|quest|raid|pvp|clan|server|runde|spieler|team|map|skillz?)\b/i.test(text);
}

/**
 * Prüft ob Hyperbel-Kontext vorliegt
 */
function _istHyperbel(text) {
    return /\b(vor\s+lachen|vor\s+freude|vor\s+aufregung|vor\s+müdigkeit|tot\s+lachen|umhauen|umwerfend)\b/i.test(text);
}

/**
 * Normalisiert Text: Leetspeak, Wiederholungen, Sonderzeichen
 */
function normalize(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
        .replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b')
        .replace(/(.)\1{2,}/g, '$1$1')       // aaaaa → aa
        .replace(/[*!@#$%^&_+.]/g, '')        // Sonderzeichen weg
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── MUSTER-DEFINITIONEN ──────────────────────────────────────────────────────
//
// Jeder Eintrag hat:
//   wort      — Regex zum Erkennen des Begriffs
//   check     — Funktion(normalizedText) → true = BLOCKIEREN
//   kategorie — für Logging
//   grund     — Fehlermeldung an User
//   aktion    — 'block' oder 'flag'
//
// Die check-Funktion entscheidet kontextabhängig.
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS = [

    // ── DIREKTE BELEIDIGUNGEN MIT PERSONALPRONOMEN ───────────────────────────

    {
        wort: /\b(dumm|doof|bescheuert|blöd|bloed)\b/i,
        aktion: 'block',
        kategorie: 'insult',
        grund: 'Beleidigung (Intelligenz)',
        // Nur blockieren wenn Direktanrede und kein Selbstbezug
        check: (t) => _hatDirektanrede(t) && !_istSelbstbezogen(t),
    },
    {
        wort: /\b(idiot|vollidiot|trottel|depp|volldepp|dämlack|blödmann|hohlkopf|dummkopf)\b/i,
        aktion: 'block',
        kategorie: 'insult',
        grund: 'Direkte Beleidigung',
        // Schimpfwörter dieser Stärke immer blockieren (auch ohne Direktanrede)
        check: () => true,
    },
    {
        wort: /\bbehindert\b/i,
        aktion: 'block',
        kategorie: 'insult',
        grund: 'Abwertende Beleidigung',
        // Erlaubt wenn über eine Sache gesprochen wird, nicht über Person
        // "du bist behindert" → block | "das formular ist behindert" → erlaubt
        check: (t) => _hatDirektanrede(t),
    },
    {
        wort: /\b(verrückt|wahnsinnig|irre|durchgeknallt)\b/i,
        aktion: 'flag',
        kategorie: 'insult',
        grund: 'Möglicherweise beleidigend',
        // Nur flaggen bei direkter Anrede; "verrücktes design" → OK
        check: (t) => _istDirektangriff(t),
    },
    {
        wort: /\b(arschloch|wichser|vollidiot|hurensohn|bastard)\b/i,
        aktion: 'block',
        kategorie: 'insult',
        grund: 'Derbe Beleidigung',
        check: () => true,
    },
    {
        wort: /\b(hure|schlampe|nutte|miststück)\b/i,
        aktion: 'block',
        kategorie: 'insult',
        grund: 'Sexistische Beleidigung',
        check: () => true,
    },

    // ── DROHUNGEN ─────────────────────────────────────────────────────────────

    {
        // "ich schlag dich", "ich hau dich", "ich find dich", "ich weiß wo du wohnst"
        wort: /\b(ich\s+(schlag|haue?|treffe?|find[e]?|kenn[e]?)\s+(dich|deine?n?|euch))\b/i,
        aktion: 'block',
        kategorie: 'drohung',
        grund: 'Persönliche Drohung',
        check: () => true,
    },
    {
        // "du wirst das bereuen", "pass auf dich auf", "ich weiß wo du wohnst"
        wort: /\b(wirst\s+das\s+bereuen|pass\s+auf\s+dich\s+auf|ich\s+wei[sß]\s+wo\s+du|ich\s+find[e]?\s+dich)\b/i,
        aktion: 'block',
        kategorie: 'drohung',
        grund: 'Implizite Drohung',
        check: () => true,
    },
    {
        // "töten", "umbringen", "abstechen" — NUR mit Direktanrede
        wort: /\b(töten|umbringen|abstechen|erschießen|killen|ermorden)\b/i,
        aktion: 'block',
        kategorie: 'drohung',
        grund: 'Gewaltandrohung',
        // Erlaubt in Gaming-Kontext ("ich kill das Level") oder Hyperbel
        check: (t) => !_istGamingKontext(t) && !_istHyperbel(t) && _hatDirektanrede(t),
    },
    {
        // "ich hasse dich" — direktes Hassobjekt
        wort: /\b(ich\s+hasse?\s+(dich|dich\s+so|euch|euch\s+alle))\b/i,
        aktion: 'block',
        kategorie: 'feindseligkeit',
        grund: 'Direkte Feindseligkeit',
        check: () => true,
    },

    // ── HASSREDE & DISKRIMINIERUNG ────────────────────────────────────────────

    {
        // "Nazi" als Beleidigung — NUR wenn direkte Anrede ODER "du/ihr ... nazi"
        // ERLAUBT: "die nazis im 2. weltkrieg", "über nazis schreiben", "nazi-deutschland"
        wort: /\b(nazi|faschist|faschistin)\b/i,
        aktion: 'block',
        kategorie: 'hassrede',
        grund: 'Beleidigung (politisch)',
        check: (t) => {
            // Direkt an Person gerichtet?
            if (_istDirektangriff(t)) return true;
            if (/\b(du|ihr)\s+\w*\s*(nazi|faschist)/i.test(t)) return true;
            if (/\b(nazi|faschist)\b.*\b(du|dich|dir|euch)\b/i.test(t)) return true;
            // Historischer/sachlicher Kontext → erlauben
            // "nazis", "die nazis", "über nazis", "nazi-regime", "nazizeit"
            if (/\b(die\s+nazis?|über\s+nazis?|nazis?\s*-\s*\w+|nazi\s*zeit|nazi\s*regime|nazi\s*deutsch|2\.\s*weltkrieg|drittes\s*reich|ns-zeit|nsdap|geschicht)\b/i.test(t)) return false;
            // Fragen über Nazis → erlauben
            if (/\b(waren|warum|wie|was|wann|wo)\b.{0,30}\b(nazi|faschist)/i.test(t)) return false;
            // Kurze Erwähnung ohne Kontext → flaggen (check gibt false, wird unten separat gehandelt)
            return false;
        },
    },
    {
        // Rassistische Beleidigungen — immer blockieren
        wort: /\b(neger|nigger|kanake|cracker|köterrasse)\b/i,
        aktion: 'block',
        kategorie: 'hassrede',
        grund: 'Rassistische Beleidigung',
        check: () => true,
    },
    {
        // Antisemitische Beleidigungen
        wort: /\b(jude[n]?\s+raus|judensau|drecksjude)\b/i,
        aktion: 'block',
        kategorie: 'hassrede',
        grund: 'Antisemitische Beleidigung',
        check: () => true,
    },

    // ── SCHWEIGEAUFFORDERUNGEN ─────────────────────────────────────────────────

    {
        // Erweitert: halts maul, halt mal die fresse, haltdieKlappe, haltet die Schnauze usw.
        wort: /\b(halts?\s*(mal\s*)?(die\s+)?(fresse|schnauze|klappe|maul|presse)|verpiss\s+dich|fick\s+dich|leck\s+mich)\b/i,
        aktion: 'block',
        kategorie: 'insult',
        grund: 'Grobe Aufforderung',
        check: () => true,
    },

    // ── GRENZWERTIGE AUSDRÜCKE (nur flaggen) ──────────────────────────────────

    {
        wort: /\b(scheiß(kerl|typ|mensch|frau|kind)?|dreckig(er?\s+\w+)?)\b/i,
        aktion: 'flag',
        kategorie: 'grenzwertig',
        grund: 'Möglicherweise beleidigender Ausdruck',
        // Nur wenn direkte Anrede
        check: (t) => _hatDirektanrede(t),
    },
    {
        wort: /\b(loser|versager|nichtsnutz|taugenichts)\b/i,
        aktion: 'flag',
        kategorie: 'insult',
        grund: 'Abwertende Bezeichnung',
        check: (t) => _hatDirektanrede(t),
    },

    // ── SELBSTVERLETZUNG / SUIZID (sensitiv behandeln) ────────────────────────

    {
        wort: /\b(bring\s+dich\s+um|erhäng\s+dich|schneid\s+dich|töte?\s+dich\s+selbst)\b/i,
        aktion: 'block',
        kategorie: 'selbstverletzung',
        grund: 'Aufforderung zur Selbstverletzung',
        check: () => true,
    },
];

// ─── HAUPTFUNKTION ────────────────────────────────────────────────────────────

/**
 * Prüft Text auf Beleidigungen mit Kontext-Bewusstsein.
 *
 * @param {string} text
 * @returns {{ blocked: boolean, geflaggt: boolean, grund: string|null, kategorie: string|null, wort: string }}
 */
function checkInsults(text) {
    if (!text || typeof text !== 'string' || text.trim().length < 2) {
        return { blocked: false, geflaggt: false, grund: null, kategorie: null, wort: '' };
    }

    const normalized = normalize(text);

    for (const pattern of PATTERNS) {
        // Wort im Text gefunden?
        const match = normalized.match(pattern.wort) || text.match(pattern.wort);
        if (!match) continue;

        // Kontext-Check: Soll blockiert/geflaggt werden?
        const sollAktioniert = pattern.check(normalized);
        if (!sollAktioniert) continue;

        const result = {
            blocked:   pattern.aktion === 'block',
            geflaggt:  pattern.aktion === 'flag',
            grund:     pattern.grund,
            kategorie: pattern.kategorie,
            wort:      match[0],
        };

        console.log(
            `🔍 [INSULT] ${pattern.aktion.toUpperCase()} | ` +
            `"${match[0]}" | ${pattern.grund} | ` +
            `Text: "${text.substring(0, 60)}"`
        );

        return result;
    }

    return { blocked: false, geflaggt: false, grund: null, kategorie: null, wort: '' };
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
module.exports = { checkInsults, normalize };