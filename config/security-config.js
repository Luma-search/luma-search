/**
 * LUMA SECURITY CONFIGURATION
 * Zentrale Sicherheitskonfiguration für alle Features
 */

module.exports = {
    // ============================================================
    // HTTPS / TLS CONFIGURATION
    // ============================================================
    https: {
        enabled: true,
        port: 3443,
        // Pfade zu selbstsigniertem Zertifikat
        // Generiert mit: node scripts/generate-cert.js
        keyPath: './config/certs/private-key.pem',
        certPath: './config/certs/certificate.pem',
        // Optional: CA für zusätzliche Zertifikate
        // caPath: './config/certs/ca.pem'
    },

    // ============================================================
    // RATE LIMITING
    // ============================================================
    rateLimit: {
        enabled: true,
        // Globale Limits
        global: {
            windowMs: 15 * 60 * 1000, // 15 Minuten
            max: 1000, // Max 1000 Requests pro 15 Min
            message: 'Zu viele Anfragen, bitte später versuchen'
        },
        // Spezielle Limits für sensible Endpoints
        search: {
            windowMs: 1 * 60 * 1000, // 1 Minute
            max: 60, // Max 60 Suchen pro Minute
            skipSuccessfulRequests: false
        },
        login: {
            windowMs: 15 * 60 * 1000,
            max: 5, // Max 5 Login-Versuche
            skipSuccessfulRequests: true
        },
        api: {
            windowMs: 60 * 60 * 1000, // 1 Stunde
            max: 10000 // Max 10k API Requests
        }
    },

    // ============================================================
    // SECURITY HEADERS
    // ============================================================
    headers: {
        // Prevent Clickjacking
        'X-Frame-Options': 'DENY',
        
        // Prevent MIME Type Sniffing
        'X-Content-Type-Options': 'nosniff',
        
        // XSS Protection
        'X-XSS-Protection': '1; mode=block',
        
        // Content Security Policy - SEHR WICHTIG!
        'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "img-src 'self' data: blob: http: https:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "connect-src 'self' http: https:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ].join('; '),
        
        // HSTS - HTTPS nur
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
        
        // Referrer Policy
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        
        // Feature Policy
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        
        // Disable Caching für sensible Daten
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    },

    // ============================================================
    // CORS (Cross-Origin Resource Sharing)
    // ============================================================
    cors: {
        origin: [
            'http://localhost:3000',
            'https://localhost:3443',
            'http://127.0.0.1:3000',
            'https://127.0.0.1:3443'
            // In Prod: 'https://yourdomain.com'
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
        exposedHeaders: ['X-Total-Count'],
        maxAge: 86400 // 24 Stunden
    },

    // ============================================================
    // INPUT VALIDATION & SANITIZATION
    // ============================================================
    validation: {
        // Max Längen für verschiedene Inputs
        maxQueryLength: 500,
        maxTitleLength: 500,
        maxContentLength: 50000,
        maxUrlLength: 2048,
        
        // Erlaubte Zeichen (Regex)
        // Erweitert um Unicode für Währungen (\u20AC = €) und & für Parameter
        queryPattern: /^[a-zA-Z0-9\s\-\+\*\/\(\)\.,:;!?\'\"$%=&@_#\^\|\[\]\{\}~\u0080-\uFFFF]*$/,
        emailPattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        urlPattern: /^https?:\/\/.+/
    },

    // ============================================================
    // AUTHENTICATION & AUTHORIZATION
    // ============================================================
    auth: {
        // JWT Secret (CHANGE IN PRODUCTION!)
        jwtSecret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
        jwtExpiration: '7d',
        
        // Session
        sessionSecret: process.env.SESSION_SECRET || 'session-secret-change-prod',
        sessionExpiration: 24 * 60 * 60 * 1000 // 24 Stunden
    },

    // ============================================================
    // API KEY MANAGEMENT
    // ============================================================
    apiKeys: {
        enabled: true,
        // API Keys sind optional, für öffentliche Suche nicht nötig
        required: false,
        // Aber für Admin/Premium Features erforderlich
        adminRequired: true
    },

    // ============================================================
    // LOGGING & MONITORING
    // ============================================================
    logging: {
        // Log verdächtige Aktivitäten
        logSuspiciousActivity: true,
        // Log all failed requests
        logFailedRequests: true,
        // Log sensitive operations (logins, deletes, etc.)
        logSensitiveOps: true,
        // Log Level: 'error', 'warn', 'info', 'debug'
        level: process.env.LOG_LEVEL || 'info'
    },

    // ============================================================
    // ENVIRONMENT
    // ============================================================
    environment: process.env.NODE_ENV || 'development',
    isDevelopment: process.env.NODE_ENV !== 'production',
    isProduction: process.env.NODE_ENV === 'production'
};
