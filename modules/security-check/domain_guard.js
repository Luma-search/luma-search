// domain_guard.js — Domain-Alters-Check mit In-Memory-Cache und Timeout
'use strict';

const whois = require('whois-json');

const DOMAIN_REGEX = /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/i;
const CACHE_TTL    = 60 * 60 * 1000; // 1 Stunde
const WHOIS_TIMEOUT = 4000;           // 4 Sekunden

// In-Memory Cache: domain → { result, cachedAt }
const cache = new Map();

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('WHOIS timeout')), ms)
        )
    ]);
}

/**
 * Prüft das Alter und die Sicherheit einer Domain via WHOIS.
 * Nur auslösen wenn Query wie eine Domain aussieht (enthält Punkt, keine Leerzeichen).
 * @param {string} domain
 * @returns {{ domain, ageInDays, level, message, created, type: 'domain_guard' }|null}
 */
async function checkDomainSecurity(domain) {
    if (!domain || !DOMAIN_REGEX.test(domain) || domain.includes(' ')) return null;

    const key = domain.toLowerCase();

    // Cache-Check
    const cached = cache.get(key);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL) {
        return cached.result;
    }

    try {
        const data = await withTimeout(whois(domain), WHOIS_TIMEOUT);

        const creationDateStr =
            data.creationDate ||
            data.created      ||
            data.creationDateTimestamp ||
            data['creation date'] ||
            null;

        if (!creationDateStr) {
            const result = {
                domain,
                ageInDays: null,
                level:     'unknown',
                message:   'Domain-Alter konnte nicht ermittelt werden.',
                created:   null,
                type:      'domain_guard'
            };
            cache.set(key, { result, cachedAt: Date.now() });
            return result;
        }

        const creationDate = new Date(creationDateStr);
        const diffInDays   = Math.floor((Date.now() - creationDate) / 86400000);

        let level   = 'safe';
        let message = `Diese Domain ist seit ${Math.floor(diffInDays / 365)} Jahr(en) registriert.`;

        if (diffInDays < 30) {
            level   = 'danger';
            message = `⚠️ Sehr neue Domain! Erst ${diffInDays} Tage alt — Vorsicht bei Zahlungen!`;
        } else if (diffInDays < 180) {
            level   = 'warning';
            message = `Diese Domain ist relativ neu (${diffInDays} Tage). Prüfe die Seriosität.`;
        }

        const result = {
            domain,
            ageInDays: diffInDays,
            level,
            message,
            created: creationDate.toLocaleDateString('de-DE'),
            type:    'domain_guard'
        };

        cache.set(key, { result, cachedAt: Date.now() });
        return result;

    } catch {
        return null;
    }
}

module.exports = { checkDomainSecurity };