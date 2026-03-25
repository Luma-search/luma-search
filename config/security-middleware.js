/**
 * SECURITY MIDDLEWARE
 * Input Validation, XSS Prevention, CSRF Protection, Sanitization
 */

const config = require('./security-config');

/**
 * Input Sanitization - Entfernt gefährliche Zeichen
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    return input
        // HTML-Entities escapen
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        // Null Bytes entfernen (Null Injection)
        .replace(/\0/g, '')
        // Kontrolle Zeichen entfernen
        .replace(/[\x00-\x1F\x7F]/g, '')
        .trim();
}

/**
 * Validiere Query/Input gegen bekannte Muster
 */
function validateInput(input, type = 'query') {
    if (!input) return false;

    const maxLength = config.validation[`max${capitalize(type)}Length`] || 500;

    // Längen-Check
    if (input.length > maxLength) {
        return false;
    }

    // Pattern Check (je nach Typ)
    switch (type) {
        case 'query':
            return config.validation.queryPattern.test(input);
        case 'email':
            return config.validation.emailPattern.test(input);
        case 'url':
            return config.validation.urlPattern.test(input);
        default:
            return true;
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * XSS Prevention Middleware
 */
function xssProtectionMiddleware(req, res, next) {
    // Sanitize Query Parameter
    if (req.query.q) {
        req.query.q = sanitizeInput(req.query.q);
    }

    // Sanitize alle Query Params
    Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
            req.query[key] = sanitizeInput(req.query[key]);
        }
    });

    // Sanitize Body (wenn POST)
    if (req.body) {
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = sanitizeInput(req.body[key]);
            }
        });
    }

    next();
}

/**
 * Input Validation Middleware
 */
function inputValidationMiddleware(req, res, next) {
    // Validiere Query Parameter
    if (req.query.q && !validateInput(req.query.q, 'query')) {
        return res.status(400).json({
            error: 'Invalid search query',
            message: 'Die Suchanfrage enthält ungültige Zeichen oder ist zu lang'
        });
    }

    // Validiere PAGE Parameter
    if (req.query.page) {
        const page = parseInt(req.query.page);
        if (isNaN(page) || page < 1) {
            return res.status(400).json({
                error: 'Invalid page number'
            });
        }
    }

    next();
}

/**
 * API Key Validation
 */
function apiKeyValidationMiddleware(req, res, next) {
    // Erlaube folgende routes OHNE API Key:
    // - /admin (HTML Dashboard)
    // - /api/admin/* (API Endpoints für Admin)
    const publicPaths = ['/admin', '/api/admin'];
    const isPublic = publicPaths.some(path => req.path.includes(path));
    
    if (isPublic) {
        return next();
    }

    // Nur für andere API-Routes: /api/v1, etc.
    if (req.path.includes('/api/v1')) {
        const apiKey = req.headers['x-api-key'];

        if (!apiKey || !isValidAPIKey(apiKey)) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid or missing API key'
            });
        }
    }

    next();
}

/**
 * Validiere API Key (Stub - kann mit DB erweitert werden)
 */
function isValidAPIKey(key) {
    // TODO: Prüfe gegen Datenbank von gültigen Keys
    const validKeys = process.env.VALID_API_KEYS?.split(',') || [];
    return validKeys.includes(key);
}

/**
 * CORS Middleware
 */
function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;

    if (config.cors.origin.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', config.cors.methods.join(', '));
        res.setHeader('Access-Control-Allow-Headers', config.cors.allowedHeaders.join(', '));
        res.setHeader('Access-Control-Expose-Headers', config.cors.exposedHeaders.join(', '));
        res.setHeader('Access-Control-Max-Age', config.cors.maxAge);
    }

    // Handle Preflight
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
}

/**
 * SQL Injection Prevention (auch für NoSQL)
 */
function sqlInjectionProtectionMiddleware(req, res, next) {
    // Prüfe auf verdächtige Patterns
    const suspiciousPatterns = [
        /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
        /(\$where|mapReduce|function|eval)/gi,
    ];

    const checkValue = (val) => {
        if (typeof val !== 'string') return false;
        return suspiciousPatterns.some(pattern => pattern.test(val));
    };

    // Check Query Params
    for (let key in req.query) {
        if (checkValue(req.query[key])) {
            console.warn(`🚨 SQL Injection attempt detected in query: ${key}`);
            return res.status(400).json({
                error: 'Invalid input detected'
            });
        }
    }

    // Check Body
    if (req.body) {
        for (let key in req.body) {
            if (checkValue(req.body[key])) {
                console.warn(`🚨 SQL Injection attempt detected in body: ${key}`);
                return res.status(400).json({
                    error: 'Invalid input detected'
                });
            }
        }
    }

    next();
}

/**
 * Logging für verdächtige Aktivitäten
 */
function securityLoggingMiddleware(req, res, next) {
    // Log zu viele Requests
    if (res.statusCode === 429) {
        console.warn(`⚠️  Rate limit exceeded: ${req.ip} - ${req.method} ${req.path}`);
    }

    // Log 4xx/5xx Errors
    if (res.statusCode >= 400) {
        console.error(`❌ Error ${res.statusCode}: ${req.method} ${req.path} from ${req.ip}`);
    }

    next();
}

// ============================================================
// EXPORT
// ============================================================
module.exports = {
    sanitizeInput,
    validateInput,
    xssProtectionMiddleware,
    inputValidationMiddleware,
    apiKeyValidationMiddleware,
    corsMiddleware,
    sqlInjectionProtectionMiddleware,
    securityLoggingMiddleware
};
