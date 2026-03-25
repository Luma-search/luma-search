/**
 * Auth-Routen: Register, Login, Logout, /api/auth/me
 */
const router = require('express').Router();
const { loginLimiter } = require('../../config/rate-limiter');
const authManager = require('../../data/auth-manager');
const { pool: sessionPool } = require('../../crawler_new/db.js');
const nutzerVertrauen = require('../../algorithmus/user-account-trust');

/**
 * POST /api/auth/register
 * Body: { email, password }
 */
router.post('/api/auth/register', loginLimiter, async (req, res) => {
    const { benutzername, email, password } = req.body;

    if (!benutzername || !email || !password)
        return res.status(400).json({ error: 'Benutzername, E-Mail und Passwort sind Pflichtfelder.' });
    if (benutzername.trim().length < 3 || benutzername.trim().length > 50)
        return res.status(400).json({ error: 'Benutzername muss zwischen 3 und 50 Zeichen haben.' });
    if (password.length < 8)
        return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' });
    if (email.length > 255)
        return res.status(400).json({ error: 'E-Mail zu lang.' });

    try {
        const existing = await authManager.findUserByEmail(email);
        if (existing)
            return res.status(409).json({ error: 'Diese E-Mail ist bereits registriert.' });

        const user = await authManager.createUser(benutzername, email, password);
        req.session.userId      = user.id;
        req.session.email       = user.email;
        req.session.benutzername = user.benutzername;
        res.json({ success: true, email: user.email });
    } catch (err) {
        console.error('Register Fehler:', err.message);
        if (err.code === '23505')
            return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
        res.status(500).json({ error: 'Registrierung fehlgeschlagen.' });
    }
});

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password, rememberMe } = req.body;

    if (!email || !password)
        return res.status(400).json({ error: 'E-Mail und Passwort sind Pflichtfelder.' });

    try {
        const user = await authManager.findUserByEmail(email);
        if (!user)
            return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });

        const ok = await authManager.verifyPassword(password, user.passwort_hash);
        if (!ok)
            return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });

        req.session.userId = user.id;
        req.session.email  = user.email;

        // "Angemeldet bleiben": persistentes Cookie für 5 Tage; sonst Session-Cookie
        if (rememberMe) {
            req.session.cookie.maxAge = 5 * 24 * 60 * 60 * 1000; // 5 Tage
        }

        // Aktivität tracken (fire-and-forget)
        sessionPool.query("SELECT public.aktivitaet_eintragen($1, 'login')", [user.id]).catch(() => {});

        res.json({ success: true, email: user.email });
    } catch (err) {
        console.error('Login Fehler:', err.message);
        res.status(500).json({ error: 'Anmeldung fehlgeschlagen.' });
    }
});

/**
 * POST /api/auth/logout
 */
router.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

/**
 * GET /api/auth/me
 * Gibt den aktuell angemeldeten Nutzer zurück
 */
router.get('/api/auth/me', (req, res) => {
    if (req.session && req.session.userId) {
        return res.json({ loggedIn: true, email: req.session.email, id: req.session.userId });
    }
    res.json({ loggedIn: false });
});

module.exports = router;
