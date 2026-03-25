/**
 * Output-Helfer: XSS-Schutz für ausgegebene Daten
 */

// Verwandelt gefährliche Zeichen in harmlose HTML-Entities
function escapeHtml(text) {
    if (!text) return text;
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// URL-Sanitization: Verhindert "javascript:" Links (XSS)
function sanitizeUrl(url) {
    if (!url) return '';
    // Erlaube interne Anker (#) oder absolute HTTP/HTTPS Links
    if (url.startsWith('#')) return url;
    if (/^(https?:\/\/)/i.test(url)) return url;
    // Alles andere (z.B. javascript:..., vbscript:...) wird blockiert
    return '#';
}

module.exports = { escapeHtml, sanitizeUrl };
