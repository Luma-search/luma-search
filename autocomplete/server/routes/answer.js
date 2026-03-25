'use strict';

/**
 * answer.js – Luma Community Q&A
 *
 * GET  /answer_autocomplete   → Antwort aus DB suchen (Volltext)
 * POST /answer_submit         → Neue Community-Antwort speichern
 *
 * Keine externen APIs. Wächst durch Community-Beiträge.
 */

module.exports = function registerAnswerRoute(app, { pool }) {

    // ── GET /answer_autocomplete ──────────────────────────────────────────────
    // Sucht in luma_ai_answers per PostgreSQL Full-Text-Search (deutsch)
    app.get('/answer_autocomplete', async (req, res) => {
        const query = (req.query.q || '').trim();
        if (query.length < 2) return res.json(null);

        try {
            // 1. Exakter Match (Priorität)
            const exact = await pool.query(
                `SELECT question, answer, source_url
                 FROM luma_ai_answers
                 WHERE lower(question) = lower($1)
                 ORDER BY updated_at DESC
                 LIMIT 1`,
                [query]
            );
            if (exact.rows.length > 0) {
                return res.json({ found: true, ...exact.rows[0] });
            }

            // 2. PostgreSQL Full-Text-Search auf Deutsch
            const fts = await pool.query(
                `SELECT question, answer, source_url,
                        ts_rank(to_tsvector('german', question || ' ' || answer),
                                plainto_tsquery('german', $1)) AS rank
                 FROM luma_ai_answers
                 WHERE to_tsvector('german', question || ' ' || answer)
                       @@ plainto_tsquery('german', $1)
                 ORDER BY rank DESC
                 LIMIT 1`,
                [query]
            );
            if (fts.rows.length > 0 && fts.rows[0].rank > 0.01) {
                return res.json({ found: true, ...fts.rows[0] });
            }

            // 3. Nichts gefunden → Frontend zeigt "Kennst du die Antwort?"
            return res.json({ found: false, question: query });

        } catch (err) {
            console.error('[answer] DB-Fehler:', err.message);
            return res.json(null);
        }
    });

    // ── POST /answer_submit ───────────────────────────────────────────────────
    // Community reicht eine Antwort ein
    app.post('/answer_submit', async (req, res) => {
        const { question, answer, source_url } = req.body || {};

        if (!question?.trim() || !answer?.trim()) {
            return res.status(400).json({ ok: false, error: 'Frage und Antwort erforderlich' });
        }
        if (answer.trim().length < 5) {
            return res.status(400).json({ ok: false, error: 'Antwort zu kurz' });
        }

        try {
            // Upsert: gleiche Frage → Antwort aktualisieren, sonst neu anlegen
            await pool.query(
                `INSERT INTO luma_ai_answers (question, answer, source_url, source)
                 VALUES ($1, $2, $3, 'community')
                 ON CONFLICT DO NOTHING`,
                [question.trim(), answer.trim(), source_url?.trim() || null]
            );
            return res.json({ ok: true });
        } catch (err) {
            console.error('[answer] Submit-Fehler:', err.message);
            return res.status(500).json({ ok: false, error: 'Datenbankfehler' });
        }
    });
};