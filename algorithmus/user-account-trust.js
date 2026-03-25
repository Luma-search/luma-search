'use strict';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * LUMA – NUTZER-VERTRAUEN SYSTEM
 * Schützt den Algorithmus vor Fake-Accounts & Bot-Farmen
 *
 * ZWEI-SCHICHT-SYSTEM:
 *
 * SCHICHT 1 – SICHTBARKEITS-GATE (Ja/Nein)
 *   Stimmen existieren immer in der DB, sind aber unsichtbar bis der Nutzer
 *   mindestens 14 Tage echte Aktivität nachgewiesen hat.
 *   → Stoppt Sofort-Manipulationen komplett
 *
 * SCHICHT 2 – DYNAMISCHES GEWICHT (0% → 100%)
 *   Das Stimm-Gewicht wächst mit der Zeit & echten Aktivität des Nutzers.
 *   Hört ein Nutzer auf → sinkt das Gewicht wieder (Inaktivitäts-Verfall).
 *   Hält ein Fake-Account wirklich durch → verdient er sich Gewicht legitim.
 *   → Faire, menschliche Logik: Vertrauen wächst durch Beweis
 *
 * ─── TABELLEN (aus migration_nutzer_vertrauen.sql) ───────────────────────────
 *
 *  public.nutzer
 *    vertrauen_score         INTEGER   DEFAULT 0       (0–100, täglich neu berechnet)
 *    stimm_gewicht           FLOAT     DEFAULT 0.0     (0.0–1.0, aus vertrauen_score)
 *    stimmen_sichtbar        BOOLEAN   DEFAULT false   (Gate: sichtbar ja/nein)
 *    aktiv_seit              DATE      NULL            (Datum erste Aktivität)
 *    zuletzt_aktiv           TIMESTAMP NULL            (Letzter Login/Suche)
 *    suchen_gesamt           INTEGER   DEFAULT 0
 *    logins_diese_woche      INTEGER   DEFAULT 0
 *    suchen_diese_woche      INTEGER   DEFAULT 0
 *    email_verifiziert       BOOLEAN   DEFAULT false
 *    telefon_verifiziert     BOOLEAN   DEFAULT false
 *    bonus_30_vergeben       BOOLEAN   DEFAULT false
 *    bonus_90_vergeben       BOOLEAN   DEFAULT false
 *    bonus_email_vergeben    BOOLEAN   DEFAULT false
 *    bonus_telefon_vergeben  BOOLEAN   DEFAULT false
 *    erstellt_am             TIMESTAMP DEFAULT now()
 *
 *  public.luma_nutzer_stimmen
 *    id                      SERIAL    PRIMARY KEY
 *    nutzer_id               INTEGER   REFERENCES nutzer(id)
 *    domain                  TEXT      (z.B. "chip.de")
 *    stimm_wert              SMALLINT  (-1 = negativ, 0 = neutral, +1 = positiv)
 *    stimm_gewicht           FLOAT     DEFAULT 0.0
 *    ist_sichtbar            BOOLEAN   DEFAULT false
 *    erstellt_am             TIMESTAMP DEFAULT now()
 *    gewicht_aktualisiert    TIMESTAMP NULL
 *
 *  public.luma_domain_votes
 *    domain                  TEXT      PRIMARY KEY
 *    positive                INTEGER   (Rohzahl – unveränderter Bestand)
 *    neutral                 INTEGER
 *    negative                INTEGER
 *    gewichtet_positiv       FLOAT     (täglich neu berechnet)
 *    gewichtet_neutral       FLOAT
 *    gewichtet_negativ       FLOAT
 *    sichtbare_stimmen       INTEGER
 *    community_score         FLOAT     (-1.0 bis +1.0)
 *    updated_at              TIMESTAMP
 *
 *  public.luma_aktivitaet
 *    nutzer_id               INTEGER
 *    aktivitaets_datum       DATE
 *    logins_heute            INTEGER
 *    suchen_heute            INTEGER
 *    klicks_heute            INTEGER
 *    stimmen_heute           INTEGER
 *    meldungen_heute         INTEGER
 *
 *  public.luma_burst_log
 *    nutzer_id               INTEGER
 *    abgestimmt_um           TIMESTAMP
 *
 * ─── EINSTIEGSPUNKTE ─────────────────────────────────────────────────────────
 *   Echtzeit (bei jedem Vote-API-Call): stimmePruefen()
 *   Täglicher Cron-Job (03:00 Uhr):    alleNutzerNeuBerechnen()
 *   UI-Status für Nutzerprofil:        getNutzerVertrauensStatus()
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Konfiguration ────────────────────────────────────────────────────────────

const KONFIG = {

    // Schicht 1: Sichtbarkeits-Gate
    MIN_AKTIVE_TAGE:             14,  // Mindest-Aktivitätstage bis Stimmen sichtbar werden
    MIN_LOGINS_PRO_WOCHE:         3,  // Mindestens X Logins pro Woche für "aktiv"
    MIN_SUCHEN_PRO_WOCHE:         5,  // Mindestens X Suchen pro Woche für "aktiv"
    MAX_INAKTIVE_TAGE:           14,  // Nach X Tagen ohne Login → Stimmen unsichtbar

    // Schicht 2: Gewichts-Schwellen (vertrauen_score → stimm_gewicht)
    GEWICHTS_STUFEN: [
        { minScore:  0, maxScore: 14,  gewicht: 0.00 },  // Unsichtbar / zu neu
        { minScore: 15, maxScore: 30,  gewicht: 0.10 },  // Frischer Account
        { minScore: 31, maxScore: 50,  gewicht: 0.25 },  // Wächst
        { minScore: 51, maxScore: 65,  gewicht: 0.50 },  // Etabliert
        { minScore: 66, maxScore: 80,  gewicht: 0.75 },  // Vertrauenswürdig
        { minScore: 81, maxScore: 100, gewicht: 1.00 },  // Vollwertig
    ],

    // Punkte-Gutschriften (positiv)
    PUNKTE: {
        TAEGLICHER_LOGIN:          1,
        SUCHANFRAGE:               2,
        KLICK_AUF_ERGEBNIS:        1,
        STIMME_PASST_ZU_COMMUNITY: 3,  // Nur wenn Konsens > 48h alt & >= 20 Stimmen
        AKTIV_30_TAGE:            10,  // Einmaliger Bonus nach 30 Tagen
        AKTIV_90_TAGE:            20,  // Einmaliger Bonus nach 90 Tagen
        EMAIL_VERIFIZIERT:        10,  // Einmaliger Bonus
        TELEFON_VERIFIZIERT:       5,  // Einmaliger Bonus (reduziert - virtuelle SIMs sind billig)
    },

    // Punkte-Abzüge (negativ)
    ABZUEGE: {
        STIMME_IMMER_ABWEICHEND:  -2,  // Stimmt immer gegen die Community
        STIMMEN_BURST:            -5,  // Zu viele Stimmen in kurzer Zeit
        FALSCHE_MELDUNGEN:        -3,  // Missbrauch der Melde-Funktion
        INAKTIVITAET_PRO_WOCHE:  -2,  // Langsamer Verfall bei Inaktivität
    },

    // Sonderregel VPN/Proxy: Kein Score-Abzug, aber Gewicht wird gedeckelt
    VERDAECHTIGE_IP_MAX_GEWICHT: 0.25,

    // Burst-Erkennung: X Stimmen in Y Minuten = Missbrauch
    BURST_FENSTER_MINUTEN:       10,
    BURST_SCHWELLE:               5,
};

// ─── Schicht 1: Sichtbarkeits-Gate ───────────────────────────────────────────

/**
 * Prüft ob die Stimmen eines Nutzers aktuell sichtbar sein dürfen.
 * Wird täglich per Job UND bei jedem Stimm-Aufruf geprüft.
 *
 * Liest aus: public.nutzer
 *   email_verifiziert, aktiv_seit, zuletzt_aktiv,
 *   logins_diese_woche, suchen_diese_woche, vertrauen_score
 *
 * @param {object} nutzer - Zeile aus public.nutzer
 * @returns {{ sichtbar: boolean, grund: string }}
 */
function stimmenSichtbarPruefen(nutzer) {
    const heute = new Date();

    // 1. Email muss verifiziert sein
    if (!nutzer.email_verifiziert) {
        return { sichtbar: false, grund: 'email_nicht_verifiziert' };
    }

    // 2. Nutzer muss mindestens MIN_AKTIVE_TAGE kontinuierlich aktiv sein
    if (!nutzer.aktiv_seit) {
        return { sichtbar: false, grund: 'keine_aktivitaet_erfasst' };
    }

    const aktivSeit = new Date(nutzer.aktiv_seit);
    const aktivTage = Math.floor((heute - aktivSeit) / (1000 * 60 * 60 * 24));

    if (aktivTage < KONFIG.MIN_AKTIVE_TAGE) {
        return {
            sichtbar: false,
            grund: `noch_${KONFIG.MIN_AKTIVE_TAGE - aktivTage}_tage_noetig`
        };
    }

    // 3. Nutzer darf nicht zu lange inaktiv gewesen sein
    if (nutzer.zuletzt_aktiv) {
        const zuletztAktiv = new Date(nutzer.zuletzt_aktiv);
        const tageInaktiv  = Math.floor((heute - zuletztAktiv) / (1000 * 60 * 60 * 24));

        if (tageInaktiv > KONFIG.MAX_INAKTIVE_TAGE) {
            return { sichtbar: false, grund: 'zu_lange_inaktiv' };
        }
    }

    // 4. Wöchentliche Mindestaktivität prüfen
    const genugLogins  = (nutzer.logins_diese_woche  || 0) >= KONFIG.MIN_LOGINS_PRO_WOCHE;
    const genugSuchen  = (nutzer.suchen_diese_woche  || 0) >= KONFIG.MIN_SUCHEN_PRO_WOCHE;

    // Toleranz: Wer vertrauen_score >= 30 hat, hat sich bereits bewährt
    if (!genugLogins && !genugSuchen && (nutzer.vertrauen_score || 0) < 30) {
        return { sichtbar: false, grund: 'zu_wenig_wochenaktivitaet' };
    }

    return { sichtbar: true, grund: 'aktiver_verifizierter_nutzer' };
}

// ─── Schicht 2: Dynamisches Stimm-Gewicht ────────────────────────────────────

/**
 * Berechnet das Stimm-Gewicht (0.0 - 1.0) eines Nutzers.
 * 0.0 = Stimme zählt gar nicht, 1.0 = Stimme zählt voll.
 *
 * Liest aus: public.nutzer → vertrauen_score
 *
 * @param {object}  nutzer         - Zeile aus public.nutzer
 * @param {boolean} verdaechtigeIp - IP ist als VPN/Proxy erkannt
 * @returns {number} gewicht         0.0 bis 1.0
 */
function stimmGewichtBerechnen(nutzer, verdaechtigeIp = false) {
    const score = Math.min(100, Math.max(0, nutzer.vertrauen_score || 0));

    // Sichtbarkeits-Gate: Unsichtbare Stimmen haben immer Gewicht 0
    const sichtbarkeit = stimmenSichtbarPruefen(nutzer);
    if (!sichtbarkeit.sichtbar) return 0.0;

    // Gewicht aus der Stufen-Tabelle ermitteln
    let gewicht = 0.0;
    for (const stufe of KONFIG.GEWICHTS_STUFEN) {
        if (score >= stufe.minScore && score <= stufe.maxScore) {
            gewicht = stufe.gewicht;
            break;
        }
    }

    // Sonderregel: VPN/Proxy-IP -> Gewicht gedeckelt statt Score-Abzug
    // (Fair gegenüber echten Nutzern die aus Datenschutzgründen VPN nutzen)
    if (verdaechtigeIp) {
        gewicht = Math.min(gewicht, KONFIG.VERDAECHTIGE_IP_MAX_GEWICHT);
    }

    return gewicht;
}

// ─── Vertrauen-Score Berechnung ───────────────────────────────────────────────

/**
 * Berechnet den neuen vertrauen_score eines Nutzers.
 * Wird täglich vom Hintergrund-Job aufgerufen (alleNutzerNeuBerechnen).
 *
 * Liest aus: public.nutzer + public.luma_aktivitaet
 *
 * @param {object} nutzer     - Zeile aus public.nutzer (inkl. konto_alter_tage)
 * @param {object} aktivitaet - Heutige Aktivitätsdaten aus public.luma_aktivitaet
 * @returns {number}            Neuer vertrauen_score (0-100)
 */
function vertrauenScoreBerechnen(nutzer, aktivitaet = {}) {
    let score = nutzer.vertrauen_score || 0;

    // ── Punkte-Gutschriften ──────────────────────────────────────────────────
    if (aktivitaet.heuteEingeloggt)             score += KONFIG.PUNKTE.TAEGLICHER_LOGIN;
    if (aktivitaet.suchenHeute > 0)             score += KONFIG.PUNKTE.SUCHANFRAGE;
    if (aktivitaet.klickHeute)                  score += KONFIG.PUNKTE.KLICK_AUF_ERGEBNIS;

    // Community-Match-Bonus: NUR wenn Konsens schon >= 48h alt & >= 20 Stimmen
    // (verhindert dass Fake-Farmen sich gegenseitig hochvoten)
    if (aktivitaet.stimmtMitKonsens)            score += KONFIG.PUNKTE.STIMME_PASST_ZU_COMMUNITY;

    // Langzeit-Boni (einmalig, Flags verhindern doppelte Vergabe)
    const kontoAlter = nutzer.konto_alter_tage || 0;
    if (kontoAlter >= 30  && !nutzer.bonus_30_vergeben)       score += KONFIG.PUNKTE.AKTIV_30_TAGE;
    if (kontoAlter >= 90  && !nutzer.bonus_90_vergeben)       score += KONFIG.PUNKTE.AKTIV_90_TAGE;

    // Verifikations-Boni (einmalig)
    if (nutzer.email_verifiziert   && !nutzer.bonus_email_vergeben)   score += KONFIG.PUNKTE.EMAIL_VERIFIZIERT;
    if (nutzer.telefon_verifiziert && !nutzer.bonus_telefon_vergeben) score += KONFIG.PUNKTE.TELEFON_VERIFIZIERT;

    // ── Punkte-Abzüge ────────────────────────────────────────────────────────
    if (aktivitaet.stimmeImmerAbweichend)   score += KONFIG.ABZUEGE.STIMME_IMMER_ABWEICHEND;
    if (aktivitaet.stimmenBurst)            score += KONFIG.ABZUEGE.STIMMEN_BURST;
    if (aktivitaet.falscheMeldungen)        score += KONFIG.ABZUEGE.FALSCHE_MELDUNGEN;

    // Inaktivitäts-Verfall: Pro inaktive Woche -2 Punkte
    const tageInaktiv = aktivitaet.tageSeitletzterAktivitaet || 0;
    if (tageInaktiv > 7) {
        const inaktiveWochen = Math.floor(tageInaktiv / 7);
        score += KONFIG.ABZUEGE.INAKTIVITAET_PRO_WOCHE * inaktiveWochen;
    }

    return Math.min(100, Math.max(0, Math.round(score)));
}

// ─── Burst-Erkennung ─────────────────────────────────────────────────────────

/**
 * Erkennt ob ein Nutzer in kurzer Zeit zu viele Stimmen abgegeben hat.
 * Echtzeit-Check vor dem Speichern einer Stimme.
 *
 * Liest aus: public.luma_burst_log → abgestimmt_um
 *
 * @param {Array<Date>} letzteStimmen - Timestamps aus luma_burst_log des Nutzers
 * @returns {boolean} true = Burst erkannt, Stimme ablehnen
 */
function burstErkennen(letzteStimmen) {
    if (!letzteStimmen || letzteStimmen.length < KONFIG.BURST_SCHWELLE) {
        return false;
    }

    const jetzt     = new Date();
    const fensterMs = KONFIG.BURST_FENSTER_MINUTEN * 60 * 1000;
    const imFenster = letzteStimmen.filter(ts => (jetzt - new Date(ts)) <= fensterMs);

    return imFenster.length >= KONFIG.BURST_SCHWELLE;
}

// ─── Konsens-Check ───────────────────────────────────────────────────────────

/**
 * Prüft ob der Community-Konsens für eine Domain bereits etabliert ist.
 * Nur dann darf der +3 Bonus für übereinstimmende Stimmen vergeben werden.
 *
 * Verhindert: Fake-Farm stimmt alle gleichzeitig ab -> alle bekommen +3 Punkte
 * Lösung: Konsens muss >= 48h alt UND >= 20 sichtbare Stimmen haben.
 *
 * Liest aus: public.luma_domain_votes → sichtbare_stimmen, updated_at
 *
 * @param {object} domainStats - { sichtbare_stimmen, aelteste_stimme_stunden }
 * @returns {boolean}
 */
function konsensEstabliert(domainStats) {
    if (!domainStats) return false;

    return (
        domainStats.sichtbare_stimmen      >= 20 &&
        domainStats.aelteste_stimme_stunden >= 48
    );
}

// ─── Echtzeit: Stimme verarbeiten ────────────────────────────────────────────

/**
 * Hauptfunktion für den Vote-API-Endpunkt in server.js.
 * Wird VOR dem INSERT in luma_nutzer_stimmen aufgerufen.
 *
 * Beispiel-Aufruf in server.js / votes-Route:
 *
 *   const nutzerVertrauen = require('./user-account-trust');
 *
 *   // Daten aus DB laden
 *   const nutzer      = await db.query('SELECT * FROM public.nutzer WHERE id = $1', [nutzerId]);
 *   const burstLog    = await db.query(
 *       'SELECT abgestimmt_um FROM public.luma_burst_log WHERE nutzer_id = $1', [nutzerId]);
 *   const domainStats = await db.query(
 *       'SELECT sichtbare_stimmen, ... FROM public.luma_domain_votes WHERE domain = $1', [domain]);
 *
 *   const ergebnis = nutzerVertrauen.stimmePruefen(
 *       nutzer.rows[0],
 *       burstLog.rows.map(r => r.abgestimmt_um),
 *       domainStats.rows[0],
 *       istVpnIp   // true/false
 *   );
 *
 *   if (!ergebnis.annehmen) return res.status(429).json({ fehler: ergebnis.grund });
 *
 *   // Stimme speichern
 *   await db.query(
 *       `INSERT INTO public.luma_nutzer_stimmen
 *        (nutzer_id, domain, stimm_wert, stimm_gewicht, ist_sichtbar)
 *        VALUES ($1, $2, $3, $4, $5)
 *        ON CONFLICT (nutzer_id, domain)
 *        DO UPDATE SET stimm_wert = $3, stimm_gewicht = $4, ist_sichtbar = $5`,
 *       [nutzerId, domain, stimmWert, ergebnis.gewicht, ergebnis.sichtbar]
 *   );
 *
 *   // Burst-Log + Aktivität tracken
 *   await db.query('INSERT INTO public.luma_burst_log (nutzer_id) VALUES ($1)', [nutzerId]);
 *   await db.query("SELECT public.aktivitaet_eintragen($1, 'stimme')", [nutzerId]);
 *
 * @param {object}  nutzer       - Zeile aus public.nutzer
 * @param {Array}   burstLog     - Timestamps aus public.luma_burst_log
 * @param {object}  domainStats  - Zeile aus public.luma_domain_votes (oder null)
 * @param {boolean} verdaechtigeIp
 *
 * @returns {{
 *   annehmen: boolean,
 *   gewicht: number,
 *   sichtbar: boolean,
 *   grund: string,
 *   konsens: boolean,
 *   vertrauenScore: number
 * }}
 */
function stimmePruefen(nutzer, burstLog = [], domainStats = null, verdaechtigeIp = false) {

    // Burst-Check: Zu viele Stimmen in kurzer Zeit -> ablehnen
    if (burstErkennen(burstLog)) {
        return {
            annehmen:       false,
            gewicht:        0,
            sichtbar:       false,
            grund:          'stimmen_burst_erkannt',
            konsens:        false,
            vertrauenScore: nutzer.vertrauen_score || 0,
        };
    }

    // Sichtbarkeit und Gewicht berechnen
    const sichtbarkeit = stimmenSichtbarPruefen(nutzer);
    const gewicht      = stimmGewichtBerechnen(nutzer, verdaechtigeIp);
    const hatKonsens   = konsensEstabliert(domainStats);

    return {
        annehmen:       true,
        gewicht:        gewicht,
        sichtbar:       sichtbarkeit.sichtbar,
        grund:          sichtbarkeit.grund,
        konsens:        hatKonsens,
        vertrauenScore: nutzer.vertrauen_score || 0,
    };
}

// ─── Batch-Job: Tägliche Neuberechnung ───────────────────────────────────────

/**
 * Täglicher Hintergrund-Job – läuft täglich um 03:00 Uhr via Cron.
 *
 * Ablauf:
 *   1. Alle Nutzer + heutige Aktivitätsdaten laden (nutzer JOIN luma_aktivitaet)
 *   2. vertrauen_score, stimm_gewicht, stimmen_sichtbar neu berechnen
 *   3. public.nutzer aktualisieren
 *   4. Alle Stimmen in luma_nutzer_stimmen neu gewichten
 *   5. Gewichtete Summen + community_score in luma_domain_votes zurückschreiben
 *   6. Alte luma_burst_log Einträge bereinigen (> 1 Stunde alt)
 *   7. Wöchentliche Zähler jeden Montag zurücksetzen
 *
 * Einbindung in cron.js / scheduler.js:
 *   const cron = require('node-cron');
 *   const nutzerVertrauen = require('./user-account-trust');
 *   cron.schedule('0 3 * * *', () => nutzerVertrauen.alleNutzerNeuBerechnen(dbPool));
 *
 * @param {object} dbPool - PostgreSQL Connection Pool (aus pg.Pool)
 */
async function alleNutzerNeuBerechnen(dbPool) {
    console.log('\n[NutzerVertrauen] ══════════════════════════════════════════════');
    console.log('[NutzerVertrauen]  Starte tägliche Vertrauen-Neuberechnung');
    console.log('[NutzerVertrauen] ══════════════════════════════════════════════');
    const start = Date.now();

    try {

        // ── 1. Alle Nutzer mit heutigen Aktivitätsdaten laden ────────────────
        const { rows: nutzerListe } = await dbPool.query(`
            SELECT
                n.id,
                n.benutzername,
                n.vertrauen_score,
                n.email_verifiziert,
                n.telefon_verifiziert,
                n.aktiv_seit,
                n.zuletzt_aktiv,
                n.logins_diese_woche,
                n.suchen_diese_woche,
                n.bonus_30_vergeben,
                n.bonus_90_vergeben,
                n.bonus_email_vergeben,
                n.bonus_telefon_vergeben,

                -- Konto-Alter in Tagen (aus erstellt_am)
                EXTRACT(EPOCH FROM (NOW() - n.erstellt_am)) / 86400
                    AS konto_alter_tage,

                -- Tage seit letzter Aktivität
                COALESCE(
                    EXTRACT(EPOCH FROM (NOW() - n.zuletzt_aktiv)) / 86400,
                    999
                ) AS tage_inaktiv,

                -- Heutige Aktivität aus luma_aktivitaet (LEFT JOIN = 0 wenn kein Eintrag)
                COALESCE(a.logins_heute,    0) AS logins_heute,
                COALESCE(a.suchen_heute,    0) AS suchen_heute,
                COALESCE(a.klicks_heute,    0) AS klicks_heute,
                COALESCE(a.stimmen_heute,   0) AS stimmen_heute,
                COALESCE(a.meldungen_heute, 0) AS meldungen_heute,

                -- Stimmt der Nutzer ständig gegen die Community? (letzte 30 Tage)
                -- true wenn: >= 10 Stimmen UND > 80% weichen vom community_score ab
                (
                    SELECT CASE
                        WHEN COUNT(*) >= 10
                         AND SUM(CASE
                                WHEN s.stimm_wert != SIGN(d.community_score)
                                THEN 1 ELSE 0
                             END)::float / COUNT(*) > 0.8
                        THEN true ELSE false
                    END
                    FROM public.luma_nutzer_stimmen s
                    JOIN public.luma_domain_votes   d ON d.domain = s.domain
                    WHERE s.nutzer_id  = n.id
                      AND s.erstellt_am >= NOW() - INTERVAL '30 days'
                ) AS stimmt_immer_abweichend

            FROM public.nutzer n
            LEFT JOIN public.luma_aktivitaet a
                ON  a.nutzer_id        = n.id
                AND a.aktivitaets_datum = CURRENT_DATE
        `);

        let aktualisiert = 0;

        // ── 2. Jeden Nutzer einzeln neu berechnen ────────────────────────────
        for (const nutzer of nutzerListe) {

            const kontoAlter = parseFloat(nutzer.konto_alter_tage) || 0;
            const tageInaktiv = parseFloat(nutzer.tage_inaktiv) || 0;

            const aktivitaet = {
                heuteEingeloggt:              parseInt(nutzer.logins_heute) > 0,
                suchenHeute:                  parseInt(nutzer.suchen_heute) || 0,
                klickHeute:                   parseInt(nutzer.klicks_heute) > 0,
                stimmtMitKonsens:             false, // wird per stimmePruefen() separat gesetzt
                tageSeitletzterAktivitaet:    tageInaktiv,
                stimmeImmerAbweichend:        nutzer.stimmt_immer_abweichend === true,
                stimmenBurst:                 false,
                falscheMeldungen:             parseInt(nutzer.meldungen_heute) > 3,
            };

            // Neuen Score + Gewicht + Sichtbarkeit berechnen
            const neuerScore   = vertrauenScoreBerechnen(
                { ...nutzer, konto_alter_tage: kontoAlter },
                aktivitaet
            );
            const neuesGewicht = stimmGewichtBerechnen({ ...nutzer, vertrauen_score: neuerScore });
            const sichtbar     = stimmenSichtbarPruefen({ ...nutzer, vertrauen_score: neuerScore });

            // aktiv_seit: setzen wenn noch nicht vorhanden, zurücksetzen bei langer Pause
            let aktivSeit = nutzer.aktiv_seit;
            if (!aktivSeit && aktivitaet.heuteEingeloggt) {
                aktivSeit = new Date();                         // Erste Aktivität beginnt heute
            } else if (tageInaktiv > KONFIG.MAX_INAKTIVE_TAGE) {
                aktivSeit = null;                               // Langer Riss -> Reset
            }

            // Einmalige Bonus-Flags: true setzen wenn Bedingung heute erstmals erfüllt
            const bonus30Jetzt    = !nutzer.bonus_30_vergeben     && kontoAlter >= 30;
            const bonus90Jetzt    = !nutzer.bonus_90_vergeben     && kontoAlter >= 90;
            const bonusEmailJetzt = !nutzer.bonus_email_vergeben  && nutzer.email_verifiziert;
            const bonusTelJetzt   = !nutzer.bonus_telefon_vergeben && nutzer.telefon_verifiziert;

            // ── 3. Nutzer in public.nutzer aktualisieren ─────────────────────
            await dbPool.query(`
                UPDATE public.nutzer SET
                    vertrauen_score        = $1,
                    stimm_gewicht          = $2,
                    stimmen_sichtbar       = $3,
                    aktiv_seit             = $4,
                    logins_diese_woche     = CASE WHEN $5 THEN logins_diese_woche + 1
                                                         ELSE logins_diese_woche END,
                    suchen_diese_woche     = suchen_diese_woche + $6,
                    suchen_gesamt          = suchen_gesamt + $6,
                    bonus_30_vergeben      = bonus_30_vergeben      OR $7,
                    bonus_90_vergeben      = bonus_90_vergeben      OR $8,
                    bonus_email_vergeben   = bonus_email_vergeben   OR $9,
                    bonus_telefon_vergeben = bonus_telefon_vergeben OR $10
                WHERE id = $11
            `, [
                neuerScore,                      // $1  vertrauen_score
                neuesGewicht,                    // $2  stimm_gewicht
                sichtbar.sichtbar,               // $3  stimmen_sichtbar
                aktivSeit,                       // $4  aktiv_seit
                aktivitaet.heuteEingeloggt,      // $5  logins_diese_woche +1?
                aktivitaet.suchenHeute,          // $6  suchen addieren
                bonus30Jetzt,                    // $7  bonus_30_vergeben
                bonus90Jetzt,                    // $8  bonus_90_vergeben
                bonusEmailJetzt,                 // $9  bonus_email_vergeben
                bonusTelJetzt,                   // $10 bonus_telefon_vergeben
                nutzer.id                        // $11 WHERE id
            ]);

            aktualisiert++;
        }

        console.log(`[NutzerVertrauen]  ${aktualisiert} Nutzer aktualisiert`);

        // ── 4. Alle Stimmen in luma_nutzer_stimmen neu gewichten ────────────
        // stimm_gewicht und ist_sichtbar kommen direkt aus public.nutzer
        await dbPool.query(`
            UPDATE public.luma_nutzer_stimmen s
            SET
                stimm_gewicht        = n.stimm_gewicht,
                ist_sichtbar         = n.stimmen_sichtbar,
                gewicht_aktualisiert = NOW()
            FROM public.nutzer n
            WHERE s.nutzer_id = n.id
        `);

        console.log('[NutzerVertrauen]  Stimmen neu gewichtet ✓');

        // ── 5. luma_domain_votes: Gewichtete Summen + community_score ────────
        // Nur sichtbare Stimmen fließen in die Berechnung ein
        await dbPool.query(`
            UPDATE public.luma_domain_votes d
            SET
                gewichtet_positiv  = COALESCE(sub.gew_positiv,  0),
                gewichtet_neutral  = COALESCE(sub.gew_neutral,  0),
                gewichtet_negativ  = COALESCE(sub.gew_negativ,  0),
                sichtbare_stimmen  = COALESCE(sub.anzahl,        0),
                community_score    = COALESCE(sub.community_score, 0.0),
                updated_at         = NOW()
            FROM (
                SELECT
                    domain,
                    SUM(CASE WHEN stimm_wert =  1 THEN stimm_gewicht ELSE 0 END) AS gew_positiv,
                    SUM(CASE WHEN stimm_wert =  0 THEN stimm_gewicht ELSE 0 END) AS gew_neutral,
                    SUM(CASE WHEN stimm_wert = -1 THEN stimm_gewicht ELSE 0 END) AS gew_negativ,
                    COUNT(*)                                                       AS anzahl,
                    ROUND(
                        SUM(stimm_wert::float * stimm_gewicht)
                        / NULLIF(SUM(stimm_gewicht), 0)
                    , 4)                                                           AS community_score
                FROM public.luma_nutzer_stimmen
                WHERE ist_sichtbar = true
                GROUP BY domain
            ) sub
            WHERE d.domain = sub.domain
        `);

        console.log('[NutzerVertrauen]  Domain-Scores aktualisiert ✓');

        // ── 6. Burst-Log bereinigen (Einträge älter als 1 Stunde löschen) ───
        const { rowCount: geloescht } = await dbPool.query(`
            DELETE FROM public.luma_burst_log
            WHERE abgestimmt_um < NOW() - INTERVAL '1 hour'
        `);

        console.log(`[NutzerVertrauen]  Burst-Log: ${geloescht} alte Einträge gelöscht ✓`);

        // ── 7. Wöchentliche Zähler jeden Montag zurücksetzen ────────────────
        if (new Date().getDay() === 1) {
            await dbPool.query(`
                UPDATE public.nutzer
                SET logins_diese_woche = 0, suchen_diese_woche = 0
            `);
            console.log('[NutzerVertrauen]  Wöchentliche Zähler zurückgesetzt (Montag) ✓');
        }

        const dauer = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[NutzerVertrauen]  Fertig in ${dauer}s`);
        console.log('[NutzerVertrauen] ══════════════════════════════════════════════\n');

    } catch (fehler) {
        console.error('[NutzerVertrauen] ✗ FEHLER:', fehler);
        throw fehler;
    }
}

// ─── UI-Hilfsfunktion: Status für Nutzerprofil ───────────────────────────────

/**
 * Gibt einen lesbaren Status für das Nutzerprofil zurück.
 * Zeigt dem Nutzer wie weit er noch ist bis seine Stimmen voll zählen.
 *
 * Verwendung im Frontend / Profil-API:
 *   const status = getNutzerVertrauensStatus(nutzerZeileAusDB);
 *   // { bezeichnung: "⏳ Noch 7 Tage aktiv bleiben", farbe: "#6b7280", fortschritt: 50 }
 *
 * @param {object} nutzer - Zeile aus public.nutzer
 * @returns {{ bezeichnung: string, farbe: string, fortschritt: number }}
 */
function getNutzerVertrauensStatus(nutzer) {
    const score    = nutzer.vertrauen_score || 0;
    const sichtbar = stimmenSichtbarPruefen(nutzer).sichtbar;

    if (!nutzer.email_verifiziert) {
        return {
            bezeichnung: '📧 E-Mail verifizieren um zu starten',
            farbe:       '#f59e0b',
            fortschritt: 5
        };
    }

    if (!sichtbar) {
        const tage = nutzer.aktiv_seit
            ? Math.floor((new Date() - new Date(nutzer.aktiv_seit)) / 86400000)
            : 0;
        const nochNoetig = Math.max(0, KONFIG.MIN_AKTIVE_TAGE - tage);
        return {
            bezeichnung: `⏳ Noch ${nochNoetig} Tage aktiv bleiben`,
            farbe:       '#6b7280',
            fortschritt: Math.min(95, Math.round((tage / KONFIG.MIN_AKTIVE_TAGE) * 100))
        };
    }

    if (score >= 81) return { bezeichnung: '⭐ Vollwertiges Mitglied (100% Gewicht)', farbe: '#22c55e', fortschritt: 100 };
    if (score >= 66) return { bezeichnung: '✓ Vertrauenswürdig (75% Gewicht)',        farbe: '#3b82f6', fortschritt: 80  };
    if (score >= 51) return { bezeichnung: '↑ Etabliert (50% Gewicht)',               farbe: '#8b5cf6', fortschritt: 60  };
    if (score >= 31) return { bezeichnung: '→ Wächst (25% Gewicht)',                  farbe: '#f59e0b', fortschritt: 35  };

    return { bezeichnung: '⊘ Stimme baut sich auf (10% Gewicht)', farbe: '#6b7280', fortschritt: 15 };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {

    // Echtzeit (bei jedem Vote-API-Call in server.js)
    stimmePruefen,             // Hauptfunktion: vor dem INSERT aufrufen
    stimmenSichtbarPruefen,    // Nur Sichtbarkeits-Check
    stimmGewichtBerechnen,     // Nur Gewichts-Berechnung
    burstErkennen,             // Missbrauchserkennung
    konsensEstabliert,         // Anti-zirkulärer Konsens-Check

    // Score-Berechnung (intern + für Tests)
    vertrauenScoreBerechnen,

    // Batch-Job (täglich 03:00 Uhr via Cron)
    alleNutzerNeuBerechnen,

    // UI-Hilfsfunktion (Profil / Dashboard)
    getNutzerVertrauensStatus,

    // Konfiguration (für Anpassungen + Tests)
    KONFIG,
};