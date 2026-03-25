/**
 * COMMUNITY MODERATION ADMIN API
 * 
 * Endpoints für Moderatoren zum Verwalten von geflaggten/blockierten Inhalten
 */

const router = require('express').Router();
const { pool } = require('../../crawler_new/db.js');

/**
 * GET /api/admin/moderation/queue
 * Zeige alle geflaggten Inhalte die Moderator-Review brauchen
 */
router.get('/api/admin/moderation/queue', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                id,
                beitrag_typ,
                beitrag_id,
                text,
                erkennte_muster as erkanntes_pattern,
                ahnlichkeit_score,
                aktion,
                kategorie,
                nutzer_ip,
                geblocked,
                geflagged,
                geprueft_am as erstellt_am,
                CASE 
                    WHEN geflagged = TRUE THEN 'flagged'
                    WHEN geblocked = TRUE THEN 'blocked'
                    ELSE 'unknown'
                END as status
            FROM gemeinschafts_moderation_verdicts
            WHERE (geblocked = TRUE OR geflagged = TRUE)
            ORDER BY geprueft_am DESC
            LIMIT 100
        `);

        res.json({
            total: result.rows.length,
            items: result.rows.map(row => ({
                id: row.id,
                type: row.beitrag_typ,
                typeId: row.beitrag_id,
                text: row.text?.substring(0, 200) || '(kein Text)',
                pattern: row.erkanntes_pattern,
                similarity: row.ahnlichkeit_score,
                action: row.aktion,
                category: row.kategorie,
                status: row.status,
                blocked: row.geblocked,
                flagged: row.geflagged,
                ip: row.nutzer_ip,
                timestamp: row.erstellt_am
            }))
        });
    } catch (err) {
        console.error('❌ Moderation Queue Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/moderation/stats
 * Statistik: Wie viel wurde blockiert/geflagged?
 */
router.get('/api/admin/moderation/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                kategorie,
                COUNT(*) as total,
                SUM(CASE WHEN geblocked THEN 1 ELSE 0 END) as blocked_count,
                SUM(CASE WHEN geflagged THEN 1 ELSE 0 END) as flagged_count,
                AVG(ahnlichkeit_score) as avg_score
            FROM gemeinschafts_moderation_verdicts
            WHERE geprueft_am > NOW() - INTERVAL '7 days'
            GROUP BY kategorie
            ORDER BY total DESC
        `);

        res.json({
            period: 'last 7 days',
            categories: result.rows.map(row => ({
                category: row.kategorie,
                total: parseInt(row.total),
                blocked: parseInt(row.blocked_count || 0),
                flagged: parseInt(row.flagged_count || 0),
                avgSimilarity: parseFloat(row.avg_score || 0).toFixed(3)
            }))
        });
    } catch (err) {
        console.error('❌ Moderation Stats Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/moderation/approve/:id
 * Moderator genehmigt einen geflaggten Beitrag
 */
router.post('/api/admin/moderation/approve/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { moderator_note } = req.body;

    try {
        await pool.query(`
            INSERT INTO gemeinschafts_moderation_actions (
                verdict_id, action, moderator_note, action_timestamp
            ) VALUES ($1, $2, $3, NOW())
            ON CONFLICT (verdict_id) DO UPDATE SET
                action = $2,
                moderator_note = $3,
                action_timestamp = NOW()
        `, [id, 'approved', moderator_note || '']);

        res.json({ success: true, action: 'approved' });
    } catch (err) {
        console.error('❌ Approval Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/moderation/reject/:id
 * Moderator lehnt einen Beitrag ab (final block)
 */
router.post('/api/admin/moderation/reject/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    const { moderator_note, delete_content } = req.body;

    try {
        const verdict = await pool.query(`
            SELECT * FROM gemeinschafts_moderation_verdicts WHERE id = $1
        `, [id]);

        if (verdict.rows.length === 0) {
            return res.status(404).json({ error: 'Verdict nicht gefunden' });
        }

        const v = verdict.rows[0];

        // Log die Moderator-Aktion
        await pool.query(`
            INSERT INTO gemeinschafts_moderation_actions (
                verdict_id, action, moderator_note, action_timestamp
            ) VALUES ($1, $2, $3, NOW())
        `, [id, 'rejected', moderator_note || '']);

        // Optional: Lösche den Content
        if (delete_content && v.beitrag_typ === 'eintrag' && v.beitrag_id) {
            await pool.query(`
                DELETE FROM community_liste_eintraege WHERE id = $1
            `, [v.beitrag_id]);
            console.log(`🗑️  Eintrag #${v.beitrag_id} gelöscht`);
        }

        res.json({ success: true, action: 'rejected', content_deleted: delete_content });
    } catch (err) {
        console.error('❌ Rejection Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
