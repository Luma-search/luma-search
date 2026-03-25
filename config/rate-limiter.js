/**
 * RATE LIMITING MODULE
 * Schutz vor DDoS, Brute Force, API Abuse
 */

const rateLimit = require('express-rate-limit');
const config = require('./security-config');

// ============================================================
// GLOBALER RATE LIMITER
// ============================================================
const globalLimiter = rateLimit({
    windowMs: config.rateLimit.global.windowMs,
    max: config.rateLimit.global.max,
    message: config.rateLimit.global.message,
    standardHeaders: true, // Return info in `RateLimit-*` headers
    legacyHeaders: false,
    skip: (req) => {
        // Lokale/interne Requests nicht limitieren
        return req.ip === '127.0.0.1' || req.ip === '::1';
    }
});

// ============================================================
// SEARCH ENDPOINT LIMITER
// ============================================================
const searchLimiter = rateLimit({
    windowMs: config.rateLimit.search.windowMs,
    max: config.rateLimit.search.max,
    message: 'Zu viele Suchen. Bitte in 1 Minute warten.',
    skipSuccessfulRequests: config.rateLimit.search.skipSuccessfulRequests,
    // Nutzt Standard IP-basierte Key-Generierung (IPv6-sicher)
    handler: (req, res) => {
        console.warn(`⚠️  Rate limit exceeded for searches from: ${req.ip}`);
        res.status(429).json({
            error: 'Too many search requests',
            message: 'Maximum 60 Suchen pro Minute erreicht',
            retryAfter: req.rateLimit.resetTime
        });
    }
});

// ============================================================
// LOGIN/AUTH LIMITER (Brute Force Protection)
// ============================================================
const loginLimiter = rateLimit({
    windowMs: config.rateLimit.login.windowMs,
    max: config.rateLimit.login.max,
    skipSuccessfulRequests: config.rateLimit.login.skipSuccessfulRequests,
    message: 'Zu viele Login-Versuche. Bitte später versuchen.',
    // Nutzt Standard IP-basierte Key-Generierung (IPv6-sicher)
    handler: (req, res) => {
        console.error(`🚨 SECURITY: Brute force attempt from ${req.ip}`);
        res.status(429).json({
            error: 'Too many login attempts',
            message: 'Account temporarily locked. Bitte später versuchen.'
        });
    }
});

// ============================================================
// API ENDPOINT LIMITER
// ============================================================
const apiLimiter = rateLimit({
    windowMs: config.rateLimit.api.windowMs,
    max: config.rateLimit.api.max,
    message: 'API rate limit exceeded',
    // Nutzt Standard IP-basierte Key-Generierung (IPv6-sicher)
    skip: (req) => {
        // API Key Bypass (falls implementiert)
        return req.headers['x-api-key'] && req.headers['x-api-key'].length > 10;
    }
});

// ============================================================
// VOTE LIMITER — großzügiger als globaler Limiter
// Max 20 Votes pro 10 Minuten pro IP
// ============================================================
const voteLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 Minuten
    max: 20,
    message: 'Zu viele Bewertungen. Bitte kurz warten.',
    skip: (req) => {
        // Localhost immer erlauben (Entwicklung)
        const ip = req.ip || '';
        return ip === '127.0.0.1' || ip === '::1' || ip.includes('127.0.0.1');
    },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Zu viele Bewertungen',
            message: 'Bitte warte kurz bevor du weitere Bewertungen abgibst.'
        });
    }
});

// ============================================================
// EXPORT
// ============================================================
module.exports = {
    globalLimiter,
    searchLimiter,
    loginLimiter,
    apiLimiter,
    voteLimiter
};