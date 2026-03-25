/**
 * LUMA CLEANER v4.0 — Brave Query Filter Edition
 *
 * Tracker-Logik portiert von Brave Browser (brave-core):
 *   brave/components/query_filter/utils.cc
 *
 * Drei Kategorien (identisch zu Brave):
 *   1. SIMPLE       — immer entfernen (66 Parameter)
 *   2. SCOPED       — nur auf bestimmten Domains entfernen
 *                     (z.B. igsh nur auf instagram.com)
 *   3. CONDITIONAL  — entfernen AUSSER die URL matched einen Pfad-Pattern
 *                     (z.B. ck_subscriber_id NICHT entfernen bei /unsubscribe)
 *
 * Zusätzlich gegenüber Brave (Luma-spezifisch):
 *   - Prefix-basierte Entfernung (utm_*, pk_*, wt_*, etc.)
 *   - Session-IDs (jsessionid, phpsessid, etc.)
 *   - www-Normalisierung (www.example.com → example.com)
 *   - Exempted hostnames (urldefense.com wird nicht angefasst)
 */

// ─── 1. SIMPLE TRACKER (66 Parameter, 1:1 aus Brave) ─────────────────────────
// Diese werden IMMER entfernt, unabhängig von Domain oder Pfad.
const SIMPLE_TRACKERS = new Set([
    // HubSpot
    '__hsfp', '__hssc', '__hstc', '_hsenc', 'hsctaTracking',
    // Newsletter/Email generic
    '__s',
    // Beehiiv
    '_bhlid',
    // Branch.io (Deep Links)
    '_branch_match_id', '_branch_referrer',
    // Google Linker
    '_gl',
    // Klaviyo
    '_kx',
    // OpenStat (Yandex)
    '_openstat',
    // ActiveTrail
    'at_recipient_id', 'at_recipient_list',
    // Bloomreach Email
    'bbeml',
    // Braze / Sailthru
    'bsft_clkid', 'bsft_uid',
    // Google Display
    'dclid',
    // Emarsys
    'et_rid',
    // Facebook
    'fb_action_ids', 'fb_comment_id', 'fbclid',
    // Google Ads
    'gclid',
    // Yahoo / Oath
    'guce_referrer', 'guce_referrer_sig',
    // Infusionsoft / Keap
    'irclickid',
    // Mailchimp
    'mc_eid',
    // MailerLite
    'ml_subscriber', 'ml_subscriber_hash',
    // Microsoft Ads
    'msclkid',
    // Matomo Campaign
    'mtm_cid',
    // Optizmo (OFT = OptForwardTracking)
    'oft_c', 'oft_ck', 'oft_d', 'oft_id', 'oft_ids', 'oft_k', 'oft_lk', 'oft_sk',
    // Olly (Emarsys)
    'oly_anon_id', 'oly_enc_id',
    // Piwik/Matomo Campaign
    'pk_cid',
    // RB Click
    'rb_clickid',
    // Adobe SiteCatalyst
    's_cid',
    // Salesforce Marketing Cloud (Exact Target)
    'sc_customer', 'sc_eh', 'sc_uid',
    // Salesforce Marketing Cloud
    'sfmc_activityid', 'sfmc_id',
    // SMS Tracking
    'sms_click', 'sms_source', 'sms_uph',
    // Google Shopping (Search Result Listing ID)
    'srsltid',
    // Rejoiner / SendGrid
    'ss_email_id',
    // Syscy
    'syclid',
    // TikTok
    'ttclid',
    // Twitter/X
    'twclid',
    // Unicorn Platform
    'unicorn_click_id',
    // Vero
    'vero_conv', 'vero_id',
    // GetResponse
    'vgo_ee',
    // Google Ads (Impression Click)
    'wbraid',
    // Wicked Reports
    'wickedid',
    // Yandex
    'yclid', 'ymclid', 'ysclid',
]);

// ─── 2. SCOPED TRACKER (nur auf bestimmten Domains entfernen) ─────────────────
// Key: Parameter-Name → Value: Array der Domains (Subdomains automatisch inkl.)
const SCOPED_TRACKERS = new Map([
    ['igsh',    ['instagram.com']],
    ['igshid',  ['instagram.com']],
    ['ref_src', ['twitter.com', 'x.com']],
    ['ref_url', ['twitter.com', 'x.com']],
    ['si',      ['youtube.com', 'youtu.be']],
]);

// ─── 3. CONDITIONAL TRACKER ──────────────────────────────────────────────────
// Diese Parameter werden ENTFERNT — AUSSER die Ziel-URL matched das Regex-Pattern.
// Sinn: Unsubscribe-Links brauchen den subscriber-Parameter, normale Seiten nicht.
const CONDITIONAL_TRACKERS = new Map([
    ['ck_subscriber_id', /\/unsubscribe/],
    ['h_sid',            /\/email\//],
    ['h_slt',            /\/email\//],
    ['mkt_tok',          /[uU]nsubscribe|emailWebview/],
]);

// ─── 4. PREFIX-BASIERTE ENTFERNUNG (Luma-spezifisch, nicht in Brave) ─────────
// Alles was mit diesen Präfixen anfängt wird entfernt.
const TRASH_PREFIXES = [
    'utm_',   // Google Analytics Campaigns
    'mtm_',   // Matomo Campaigns (außer mtm_cid, schon in SIMPLE)
    'pk_',    // Piwik (außer pk_cid, schon in SIMPLE)
    'mc_',    // Mailchimp (außer mc_eid, schon in SIMPLE)
    'fb_',    // Facebook (außer fbclid, schon in SIMPLE)
    'wt_',    // Webtrekk / Mapp Analytics
    '_hs',    // HubSpot (außer __hsfp etc., schon in SIMPLE)
    'aff_',   // Affiliate-Programme
    'pf_rd_', // Amazon Placement IDs
    'pd_rd_', // Amazon Session IDs
];

// ─── 5. SESSION / TECHNISCHE PARAMETER (Luma-spezifisch) ─────────────────────
// Erzeugen Duplikate in der DB — selbe Seite, andere Session-ID.
const SESSION_PARAMS = new Set([
    'sessionid', 'session_id', 'jsessionid', 'phpsessid',
]);

// ─── 6. EXEMPTED HOSTNAMES (1:1 aus Brave) ───────────────────────────────────
// Diese Domains werden NICHT angefasst (kein Tracking-Stripping).
const EXEMPTED_HOSTNAMES = new Set([
    'urldefense.com', // Proofpoint URL Defense — enthält verschlüsselte Redirect-URLs
]);

// ─── Hilfsfunktion: Domain-Match inkl. Subdomains ────────────────────────────
function domainMatches(hostname, targetDomain) {
    return hostname === targetDomain || hostname.endsWith('.' + targetDomain);
}

// ─── Hilfsfunktion: Scoped-Tracker-Prüfung ───────────────────────────────────
function isScopedTracker(lowerKey, hostname) {
    const domains = SCOPED_TRACKERS.get(lowerKey);
    if (!domains || domains.length === 0) return false;
    return domains.some(d => domainMatches(hostname, d));
}

// ─── Hilfsfunktion: Conditional-Tracker-Prüfung ──────────────────────────────
// Gibt true zurück wenn der Parameter entfernt werden SOLL.
function isConditionalTracker(lowerKey, urlStr) {
    const exemptPattern = CONDITIONAL_TRACKERS.get(lowerKey);
    if (!exemptPattern) return false;
    // URL matched das Ausnahme-Pattern → NICHT entfernen (legitimer Link)
    return !exemptPattern.test(urlStr);
}

// ═════════════════════════════════════════════════════════════════════════════

const LumaCleaner = {

    /**
     * URL-WÄSCHE: Entfernt Tracker, Fragmente und normalisiert Links.
     *
     * Logik-Hierarchie:
     *   0. Exempted hostnames  → sofort unverändert zurückgeben
     *   1. Prefix-Prüfung     → utm_*, fb_*, wt_*, pf_rd_*, etc.
     *   2. Simple Trackers    → Braves 66-Parameter-Liste
     *   3. Scoped Trackers    → igsh (nur Instagram), si (nur YouTube), etc.
     *   4. Conditional        → ck_subscriber_id (nicht bei /unsubscribe), etc.
     *   5. Session-Params     → jsessionid, phpsessid, etc.
     *   6. Normalisierung     → www entfernen, Trailing-Slash weg, Hash weg
     */
    washUrl: (urlStr) => {
        try {
            if (!urlStr) return '';
            const original = urlStr.trim();
            const url = new URL(original);

            // 0. Exempted hostnames — nichts anfassen
            const hostname = url.hostname.toLowerCase();
            if (EXEMPTED_HOSTNAMES.has(hostname)) {
                return original;
            }

            // Parameter filtern — wir sammeln erst, dann löschen
            // (URLSearchParams während Iteration mutieren ist unsicher)
            const paramsToDelete = [];
            for (const [key] of url.searchParams) {
                const lowerKey = key.toLowerCase();

                // 1. Prefix-Match
                if (TRASH_PREFIXES.some(pre => lowerKey.startsWith(pre))) {
                    paramsToDelete.push(key);
                    continue;
                }
                // 2. Simple Trackers
                if (SIMPLE_TRACKERS.has(lowerKey)) {
                    paramsToDelete.push(key);
                    continue;
                }
                // 3. Scoped Trackers
                if (isScopedTracker(lowerKey, hostname)) {
                    paramsToDelete.push(key);
                    continue;
                }
                // 4. Conditional Trackers
                if (isConditionalTracker(lowerKey, original)) {
                    paramsToDelete.push(key);
                    continue;
                }
                // 5. Session-Parameter
                if (SESSION_PARAMS.has(lowerKey)) {
                    paramsToDelete.push(key);
                    continue;
                }
            }

            for (const key of paramsToDelete) {
                url.searchParams.delete(key);
            }

            // Hash entfernen
            url.hash = '';

            // www-Normalisierung: www.example.com → example.com
            // Verhindert Duplikate für www / non-www Varianten in der DB
            if (url.hostname.startsWith('www.')) {
                url.hostname = url.hostname.slice(4);
            }

            // Saubere URL zusammenbauen
            // Nur Host + Protokoll lowercase — Pfad NICHT (kann case-sensitiv sein!)
            const cleanUrl = url.protocol.toLowerCase()
                + '//'
                + url.hostname.toLowerCase()
                + url.pathname.replace(/\/$/, '')
                + (url.search || '');

            return cleanUrl;
        } catch {
            // Ungültige URL → unverändert zurückgeben
            return urlStr;
        }
    },

    /**
     * QUERY-WÄSCHE: Schutz vor Hacker-Code und Müll-Suchen
     */
    washQuery: (query) => {
        if (!query) return '';
        return query
            .replace(/<[^>]*>/g, '')                  // XSS-Schutz
            .replace(/[!"§$%&/()=?`*';:_,.]/g, ' ')   // Sonderzeichen raus
            .replace(/\s\s+/g, ' ')                   // Mehrfach-Leerzeichen
            .trim()
            .toLowerCase()
            .substring(0, 80);
    },

    /**
     * TITEL-REINIGUNG & BRANDING-REMOVAL
     */
    washTitle: (title) => {
        if (!title) return 'Unbekannte Seite';
        return title
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&ndash;/g, '-')
            .replace(/Chefkoch\.de|BILD\.de|Spiegel Online|WELT/gi, '')
            .replace(/\s\s+/g, ' ')
            .trim();
    },

    /**
     * KATEGORIE-DETEKTOR: Fixt falsche Zuweisungen
     */
    detectCategory: (url, currentCat) => {
        const urlLower = url.toLowerCase();
        if (urlLower.includes('chefkoch.de/rezepte')) return 'rezept';
        if (urlLower.includes('kochbar.de/rezept')) return 'rezept';
        if (urlLower.includes('duden.de/rechtschreibung')) return 'lexikon';
        return currentCat;
    },
};

module.exports = LumaCleaner;