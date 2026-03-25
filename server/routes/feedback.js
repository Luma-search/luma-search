/**
 * Feedback-Routen: Reviews (Bewertungen) und Votes (Community-Abstimmungen)
 */
const router = require('express').Router();
const { apiLimiter } = require('../../config/rate-limiter');
const requireAuth = require('../middleware/requireAuth');
const ratingsManager = require('../../data/ratings-manager');
const { pool: sessionPool } = require('../../crawler_new/db.js');
const nutzerVertrauen = require('../../algorithmus/user-account-trust');

// ============================================================
// RATINGS / REVIEWS API
// ============================================================

/**
 * POST /api/reviews - Neue Bewertung hinzufügen
 * Body: { domain, stars, user, text }
 */
router.post('/api/reviews', apiLimiter, (req, res) => {
    try {
        const { domain, stars, user, text } = req.body;

        if (!domain || !stars || !user || !text) {
            return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
        }

        // Validierung
        if (stars < 1 || stars > 5 || !Number.isInteger(parseInt(stars))) {
            return res.status(400).json({ error: 'Sterne müssen zwischen 1 und 5 liegen' });
        }

        // XSS & SQL Injection Schutz (wurde bereits durch Middleware getan, aber extra Check)
        if (user.length > 50 || text.length > 500) {
            return res.status(400).json({ error: 'Text zu lang' });
        }

        // Bewertung speichern
        ratingsManager.addRating(domain, parseInt(stars), user, text);

        console.log(`✓ Neue Bewertung: ${domain} von ${user}: ${stars} Sterne`);
        res.status(201).json({
            success: true,
            message: 'Bewertung erfolgreich gespeichert. Sie wird nach Prüfung veröffentlicht.'
        });

    } catch (error) {
        console.error('❌ Reviews POST Error:', error.message);
        res.status(500).json({ error: 'Fehler beim Speichern der Bewertung' });
    }
});

/**
 * GET /api/reviews - Bewertungen für eine Domain oder alle abrufen
 * Query: ?domain=example.com (optional)
 */
router.get('/api/reviews', (req, res) => {
    try {
        const domainParam = req.query.domain;

        if (domainParam) {
            // Einzelne Domain
            const normalizedDomain = domainParam.replace(/^www\./, '').toLowerCase();
            const ratings = ratingsManager.getRatings(normalizedDomain);
            const average = ratingsManager.getAverageRating(normalizedDomain);

            return res.json({
                domain: normalizedDomain,
                ratings: ratings,
                average: average.average,
                count: average.count
            });
        } else {
            // Alle Ratings
            const allRatings = ratingsManager.getAllRatings();
            res.json(allRatings);
        }

    } catch (error) {
        console.error('❌ Reviews GET Error:', error.message);
        res.status(500).json({ error: 'Fehler beim Abrufen der Bewertungen' });
    }
});

/**
 * GET /api/reviews/average/:domain - Nur Durchschnitt für eine Domain
 */
router.get('/api/reviews/average/:domain', (req, res) => {
    try {
        const domain = req.params.domain.replace(/^www\./, '').toLowerCase();
        const average = ratingsManager.getAverageRating(domain);

        res.json({
            domain: domain,
            average: average.average,
            count: average.count
        });

    } catch (error) {
        console.error('❌ Reviews Average Error:', error.message);
        res.status(500).json({ error: 'Fehler' });
    }
});

// ============================================================
// VOTES API  (positiv / neutral / negativ — anonym, kein Text)
// ============================================================

/**
 * POST /api/votes
 * Body: { domain, type }  — type: 'positive' | 'neutral' | 'negative'
 * Gesichert durch Nutzer-Vertrauen-System (user-account-trust.js):
 *   - Burst-Erkennung (max. 5 Stimmen in 10 Minuten)
 *   - Sichtbarkeits-Gate (erst nach 14 aktiven Tagen sichtbar)
 *   - Dynamisches Stimm-Gewicht (0% → 100% je nach vertrauen_score)
 */
router.post('/api/votes', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { domain, type } = req.body;
        const userId = req.session.userId;

        if (!domain || !type) {
            return res.status(400).json({ error: 'domain und type sind erforderlich' });
        }

        // type → Zahlenwert
        const stimmWert = type === 'positive' ? 1 : type === 'negative' ? -1 : 0;

        // 1. Nutzer aus public.nutzer laden
        const nutzerRes = await sessionPool.query(
            'SELECT * FROM public.nutzer WHERE id = $1',
            [userId]
        );
        const nutzer = nutzerRes.rows[0];
        if (!nutzer) return res.status(401).json({ error: 'Nicht eingeloggt' });

        // 2. Burst-Log des Nutzers laden (letzte 10 Minuten)
        const burstRes = await sessionPool.query(
            `SELECT abgestimmt_um FROM public.luma_burst_log
             WHERE nutzer_id = $1
               AND abgestimmt_um > NOW() - INTERVAL '10 minutes'`,
            [nutzer.id]
        );

        // 3. Domain-Konsens-Status laden
        const domainRes = await sessionPool.query(
            `SELECT
                sichtbare_stimmen,
                EXTRACT(EPOCH FROM (NOW() - MIN(s.erstellt_am))) / 3600
                    AS aelteste_stimme_stunden
             FROM public.luma_domain_votes d
             LEFT JOIN public.luma_nutzer_stimmen s ON s.domain = d.domain
             WHERE d.domain = $1
             GROUP BY d.sichtbare_stimmen`,
            [domain]
        );

        // 4. IP-Prüfung (Platzhalter – eigene VPN-Erkennung hier eintragen)
        const verdaechtigeIp = false;

        // 5. Vertrauen-Check
        const pruefErgebnis = nutzerVertrauen.stimmePruefen(
            nutzer,
            burstRes.rows.map(r => r.abgestimmt_um),
            domainRes.rows[0] || null,
            verdaechtigeIp
        );

        // Burst erkannt → ablehnen
        if (!pruefErgebnis.annehmen) {
            return res.status(429).json({ error: 'Zu viele Stimmen in kurzer Zeit.' });
        }

        // 6. Stimme in luma_nutzer_stimmen speichern (mit Gewicht)
        await sessionPool.query(
            `INSERT INTO public.luma_nutzer_stimmen
                 (nutzer_id, domain, stimm_wert, stimm_gewicht, ist_sichtbar)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (nutzer_id, domain)
             DO UPDATE SET
                 stimm_wert    = $3,
                 stimm_gewicht = $4,
                 ist_sichtbar  = $5`,
            [nutzer.id, domain, stimmWert, pruefErgebnis.gewicht, pruefErgebnis.sichtbar]
        );

        // 7. Rohzahlen in luma_domain_votes aktualisieren
        await sessionPool.query(
            `INSERT INTO public.luma_domain_votes (domain, positive, neutral, negative)
             VALUES ($1,
                 CASE WHEN $2 = 1  THEN 1 ELSE 0 END,
                 CASE WHEN $2 = 0  THEN 1 ELSE 0 END,
                 CASE WHEN $2 = -1 THEN 1 ELSE 0 END
             )
             ON CONFLICT (domain) DO UPDATE SET
                 positive   = luma_domain_votes.positive
                              + CASE WHEN $2 = 1  THEN 1 ELSE 0 END,
                 neutral    = luma_domain_votes.neutral
                              + CASE WHEN $2 = 0  THEN 1 ELSE 0 END,
                 negative   = luma_domain_votes.negative
                              + CASE WHEN $2 = -1 THEN 1 ELSE 0 END,
                 updated_at = NOW()`,
            [domain, stimmWert]
        );

        // 8. Burst-Log + Aktivität tracken
        await sessionPool.query(
            'INSERT INTO public.luma_burst_log (nutzer_id) VALUES ($1)',
            [nutzer.id]
        );
        sessionPool.query(
            "SELECT public.aktivitaet_eintragen($1, 'stimme')",
            [nutzer.id]
        ).catch(() => {});

        // Aktualisierte Vote-Zahlen mitschicken → Approval-Rating berechnen
        const updatedRes = await sessionPool.query(
            'SELECT positive, neutral, negative, (positive + neutral + negative) as total FROM public.luma_domain_votes WHERE domain = $1',
            [domain]
        );
        const voteRow = updatedRes.rows[0];
        const totalVotes = voteRow ? (voteRow.total || 0) : 0;
        const positiveVotes = voteRow ? (voteRow.positive || 0) : 0;
        const negativeVotes = voteRow ? (voteRow.negative || 0) : 0;
        
        // Approval-Rating: 0-100%, basierend auf positive vs. negative
        const approvalRating = totalVotes > 0 && (positiveVotes + negativeVotes) > 0
            ? Math.round((positiveVotes / (positiveVotes + negativeVotes)) * 100)
            : null;

        return res.json({
            success:  true,
            action:   'voted',
            sichtbar: pruefErgebnis.sichtbar,
            gewicht:  pruefErgebnis.gewicht,
            approvalRating: approvalRating,
            totalVotes: totalVotes
        });

    } catch (error) {
        console.error('❌ Votes POST Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/votes?domain=example.com          → Einzelne Domain
 * GET /api/votes?domains=chip.de,heise.de    → Batch (kommasepariert)
 */
router.get('/api/votes', async (req, res) => {
    try {
        // Batch-Anfrage: ?domains=chip.de,heise.de,...
        if (req.query.domains) {
            const domains = req.query.domains
                .split(',')
                .map(d => d.trim().replace(/^www\./, '').toLowerCase())
                .filter(d => d.length > 0);

            if (domains.length === 0) return res.status(400).json({ error: 'domains fehlt' });

            const batchRes = await sessionPool.query(
                'SELECT domain, positive, neutral, negative, (positive + neutral + negative) as total FROM luma_domain_votes WHERE domain = ANY($1::text[])',
                [domains]
            );
            const result = {};
            for (const domain of domains) {
                const row = batchRes.rows.find(r => r.domain === domain);
                if (row) {
                    const totalVotes = row.total || 0;
                    const positiveVotes = row.positive || 0;
                    const negativeVotes = row.negative || 0;
                    const approvalRating = totalVotes > 0 && (positiveVotes + negativeVotes) > 0
                        ? Math.round((positiveVotes / (positiveVotes + negativeVotes)) * 100)
                        : null;
                    result[domain] = { approvalRating, totalVotes };
                } else {
                    result[domain] = { approvalRating: null, totalVotes: 0 };
                }
            }
            return res.json(result);
        }

        // Einzelne Domain: ?domain=example.com
        const domain = (req.query.domain || '').replace(/^www\./, '').toLowerCase();
        if (!domain) return res.status(400).json({ error: 'domain fehlt' });

        const result = await sessionPool.query(
            'SELECT positive, neutral, negative, (positive + neutral + negative) as total FROM luma_domain_votes WHERE domain = $1',
            [domain]
        );
        const statsRow = result.rows[0];
        const totalVotes = statsRow ? (statsRow.total || 0) : 0;
        const positiveVotes = statsRow ? (statsRow.positive || 0) : 0;
        const negativeVotes = statsRow ? (statsRow.negative || 0) : 0;
        
        // Approval-Rating: 0-100%
        const approvalRating = totalVotes > 0 && (positiveVotes + negativeVotes) > 0
            ? Math.round((positiveVotes / (positiveVotes + negativeVotes)) * 100)
            : null;

        res.json({ domain, approvalRating, totalVotes });

    } catch (error) {
        console.error('❌ Votes GET Error:', error.message);
        res.status(500).json({ error: 'Fehler beim Abrufen der Votes' });
    }
});

/**
 * GET /api/votes/my-votes - Alle Domains die der aktuelle User abgestimmt hat
 * Ruft Daten aus luma_nutzer_votes + luma_domain_votes ab (DB-Quelle, nicht localStorage)
 */
router.get('/api/votes/my-votes', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Nicht eingeloggt' });
        }

        // Alle Domains abrufen auf die dieser User abgestimmt hat
        const userVotesRes = await sessionPool.query(
            `SELECT DISTINCT domain FROM public.luma_nutzer_votes
             WHERE nutzer_id = $1
             ORDER BY domain ASC`,
            [userId]
        );

        const domains = userVotesRes.rows.map(r => r.domain);

        if (domains.length === 0) {
            return res.json({ items: [] });
        }

        // Für jede Domain die aggregierten Vote-Daten abrufen
        const result = await sessionPool.query(
            `SELECT domain, positive, neutral, negative, (positive + neutral + negative) as total
             FROM public.luma_domain_votes
             WHERE domain = ANY($1)
             ORDER BY domain ASC`,
            [domains]
        );

        // In Response-Format konvertieren
        const items = result.rows.map(row => {
            const totalVotes = row.total || 0;
            const positiveVotes = row.positive || 0;
            const negativeVotes = row.negative || 0;
            
            const approvalRating = totalVotes > 0 && (positiveVotes + negativeVotes) > 0
                ? Math.round((positiveVotes / (positiveVotes + negativeVotes)) * 100)
                : null;

            return {
                domain: row.domain,
                approvalRating,
                totalVotes
            };
        });

        res.json({ items });

    } catch (error) {
        console.error('❌ Votes /my-votes Error:', error.message);
        res.status(500).json({ error: 'Fehler beim Abrufen der Votes' });
    }
});

module.exports = router;
