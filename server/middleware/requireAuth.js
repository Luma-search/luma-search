/**
 * Auth-Middleware: Schützt Routen vor unangemeldeten Nutzern
 */
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) return next();
    // Für API-Aufrufe: JSON-Fehler zurückgeben
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Nicht angemeldet.' });
    }
    // Für Seiten: zum Login weiterleiten
    return res.redirect('/login.html?redirect=' + encodeURIComponent(req.originalUrl));
}

module.exports = requireAuth;
