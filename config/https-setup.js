/**
 * HTTPS / TLS SETUP
 * Konfiguriert sichere Verbindungen mit SSL/TLS Zertifikaten
 * Für Entwicklung: Selbstsignierte Zertifikate
 * Für Produktion: Let's Encrypt oder ähnliches
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('./security-config');

/**
 * Lädt oder erstellt HTTPS-Zertifikate
 */
function setupHTTPS() {
    const certDir = path.join(__dirname, 'certs');
    const keyPath = path.join(certDir, 'private-key.pem');
    const certPath = path.join(certDir, 'certificate.pem');

    // Stelle sicher, dass Cert-Verzeichnis existiert
    if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
    }

    // Wenn Zertifikate nicht existieren, zeige Anleitung
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.warn(`
⚠️  HTTPS-Zertifikate nicht gefunden!

Zum Generieren selbstsignierter Zertifikate:

WINDOWS (PowerShell als Admin):
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
    -keyout config/certs/private-key.pem \\
    -out config/certs/certificate.pem \\
    -subj "/C=DE/ST=State/L=City/O=Org/CN=localhost"

LINUX/MAC:
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\
    -keyout config/certs/private-key.pem \\
    -out config/certs/certificate.pem \\
    -subj "/C=DE/ST=State/L=City/O=Org/CN=localhost"

ODER mit Node (npm install selfsigned):
  node scripts/generate-cert.js
        `);
        
        // Fallback: HTTP nur in dev
        if (config.isDevelopment) {
            console.log('📝 Läufe im HTTP-Modus (nur für Entwicklung)');
            return null;
        }
        
        throw new Error('HTTPS-Zertifikate erforderlich für Produktion!');
    }

    try {
        const privateKey = fs.readFileSync(keyPath, 'utf8');
        const certificate = fs.readFileSync(certPath, 'utf8');

        return {
            key: privateKey,
            cert: certificate
        };
    } catch (error) {
        console.error('❌ Fehler beim Laden der HTTPS-Zertifikate:', error.message);
        throw error;
    }
}

/**
 * Erstellt HTTPS Server
 */
function createHTTPSServer(app) {
    if (!config.https.enabled) {
        console.log('ℹ️  HTTPS ist deaktiviert');
        return null;
    }

    const credentials = setupHTTPS();
    if (!credentials) {
        return null; // HTTP Fallback
    }

    const httpsServer = https.createServer(credentials, app);
    return httpsServer;
}

/**
 * Security Headers Middleware
 */
function securityHeadersMiddleware(req, res, next) {
    // Setze alle Security Headers
    Object.entries(config.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
    
    next();
}

/**
 * HSTS Header für HTTPS
 */
function hstsMiddleware(req, res, next) {
    if (req.protocol === 'https') {
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains; preload'
        );
    }
    next();
}

/**
 * Redirect HTTP zu HTTPS (für Production)
 */
function httpsRedirect(req, res, next) {
    if (!config.isProduction) {
        return next();
    }

    if (req.protocol !== 'https') {
        return res.redirect(301, `https://${req.get('host')}${req.url}`);
    }
    next();
}

// ============================================================
// EXPORT
// ============================================================
module.exports = {
    setupHTTPS,
    createHTTPSServer,
    securityHeadersMiddleware,
    hstsMiddleware,
    httpsRedirect
};
