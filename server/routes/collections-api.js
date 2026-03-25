/**
 * ═══════════════════════════════════════════════════════════════════
 *  LUMA – SOCIAL COLLECTIONS API  v3
 *  Tabellen: collections · collection_eintraege · collection_likes
 *
 *  GET    /api/collections              → Alle öffentlichen Sammlungen
 *  GET    /api/collections?user=me      → Eigene Sammlungen + likedIds
 *  GET    /api/collections?filter=top   → Top Sammlungen (Discovery)
 *  GET    /api/collections?category=X   → Nach Kategorie filtern
 *  GET    /api/collections/:id          → Einzelne Sammlung + Einträge
 *  POST   /api/collections              → Neue Sammlung erstellen
 *  POST   /api/collections/add         → Link + Empfehlung hinzufügen
 *  POST   /api/collections/:id/like    → Like setzen (kein Doppel-Like)
 *  DELETE /api/collections/:id/like    → Like entfernen
 * ═══════════════════════════════════════════════════════════════════
 */

const { stimmenSichtbarPruefen } = require('../../algorithmus/user-account-trust');
const { pool } = require('../../crawler_new/db.js');

module.exports = (app) => {

// ─── Hilfsfunktion: Nutzer aus Session laden ──────────────────────
async function getNutzerAusSession(req) {
    const userId = req.session?.userId
                || req.session?.user?.id
                || req.session?.nutzer?.id;
    if (!userId) return null;
    try {
        const result = await pool.query(
            'SELECT * FROM public.nutzer WHERE id = $1 LIMIT 1',
            [userId]
        );
        return result.rows[0] || null;
    } catch { return null; }
}

// ─── GET /api/collections ─────────────────────────────────────────
app.get('/api/collections', async (req, res) => {
    try {
        const { user, filter, category, limit = 50 } = req.query;
        const nutzer = await getNutzerAusSession(req);
        let rows;

        if (user === 'me' && nutzer) {
            // ── Eigene Sammlungen ──────────────────────────────────
            const result = await pool.query(`
                SELECT
                    c.id,
                    c.titel          AS title,
                    c.beschreibung   AS description,
                    c.kategorie      AS category,
                    c.tags,
                    c.likes_anzahl   AS "likeCount",
                    c.erstellt_von   AS username,
                    c.ist_versteckt,
                    c.erstellt_am,
                    COUNT(e.id)      AS "entryCount"
                FROM public.collections c
                LEFT JOIN public.collection_eintraege e
                    ON e.collection_id = c.id AND e.ist_versteckt = false
                WHERE c.nutzer_id = $1
                GROUP BY c.id
                ORDER BY c.erstellt_am DESC
                LIMIT $2
            `, [nutzer.id, parseInt(limit)]);

            // Gelikte IDs aus DB laden
            const likedRes = await pool.query(
                'SELECT collection_id FROM public.collection_likes WHERE nutzer_id = $1',
                [nutzer.id]
            );
            const likedIds = likedRes.rows.map(r => r.collection_id);

            rows = result.rows.map(row => ({
                ...row,
                entryCount: parseInt(row.entryCount) || 0,
                likeCount:  parseInt(row.likeCount)  || 0,
                isOwn:      true,
                isLiked:    likedIds.includes(row.id),
            }));

            return res.json({ lists: rows, likedIds });

        } else if (filter === 'top' || category) {
            // ── Top / Kategorie-Filter ─────────────────────────────
            const catFilter = category ? 'AND c.kategorie ILIKE $2' : '';
            const orderBy   = filter === 'top'
                ? 'c.likes_anzahl DESC, "entryCount" DESC'
                : 'c.erstellt_am DESC';

            const result = await pool.query(`
                SELECT
                    c.id,
                    c.titel          AS title,
                    c.beschreibung   AS description,
                    c.kategorie      AS category,
                    c.tags,
                    c.likes_anzahl   AS "likeCount",
                    c.erstellt_von   AS username,
                    c.erstellt_am,
                    COUNT(e.id)      AS "entryCount"
                FROM public.collections c
                LEFT JOIN public.collection_eintraege e
                    ON e.collection_id = c.id AND e.ist_versteckt = false
                WHERE c.ist_versteckt = false
                ${catFilter}
                GROUP BY c.id
                ORDER BY ${orderBy}
                LIMIT $1
            `, category ? [parseInt(limit), `%${category}%`] : [parseInt(limit)]);

            rows = result.rows.map(row => ({
                ...row,
                entryCount: parseInt(row.entryCount) || 0,
                likeCount:  parseInt(row.likeCount)  || 0,
                isOwn: nutzer ? row.username === nutzer.benutzername : false,
            }));

            return res.json(rows);

        } else {
            // ── Alle öffentlichen Sammlungen ───────────────────────
            const result = await pool.query(`
                SELECT
                    c.id,
                    c.titel          AS title,
                    c.beschreibung   AS description,
                    c.kategorie      AS category,
                    c.tags,
                    c.likes_anzahl   AS "likeCount",
                    c.erstellt_von   AS username,
                    c.erstellt_am,
                    COUNT(e.id)      AS "entryCount"
                FROM public.collections c
                LEFT JOIN public.collection_eintraege e
                    ON e.collection_id = c.id AND e.ist_versteckt = false
                WHERE c.ist_versteckt = false
                GROUP BY c.id
                ORDER BY c.erstellt_am DESC
                LIMIT $1
            `, [parseInt(limit)]);

            rows = result.rows.map(row => ({
                ...row,
                entryCount: parseInt(row.entryCount) || 0,
                likeCount:  parseInt(row.likeCount)  || 0,
                isOwn: nutzer ? row.username === nutzer.benutzername : false,
            }));

            return res.json(rows);
        }

    } catch (err) {
        console.error('[Collections] GET /api/collections:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// ─── GET /api/collections/:id ─────────────────────────────────────
app.get('/api/collections/:id', async (req, res) => {
    try {
        const collId = parseInt(req.params.id);

        const collRes = await pool.query(`
            SELECT
                c.id,
                c.titel         AS title,
                c.beschreibung  AS description,
                c.kategorie     AS category,
                c.tags,
                c.likes_anzahl  AS "likeCount",
                c.erstellt_von  AS username,
                c.erstellt_am,
                c.ist_versteckt
            FROM public.collections c
            WHERE c.id = $1 LIMIT 1
        `, [collId]);

        if (!collRes.rows[0]) return res.status(404).json({ error: 'Nicht gefunden' });
        const coll = collRes.rows[0];
        if (coll.ist_versteckt) return res.status(403).json({ error: 'Versteckt' });

        const entriesRes = await pool.query(`
            SELECT
                e.id,
                e.url,
                e.titel,
                e.empfehlung   AS reason,
                e.nutzername   AS username,
                e.erstellt_am,
                e.ist_sichtbar
            FROM public.collection_eintraege e
            WHERE e.collection_id = $1
              AND e.ist_versteckt = false
              AND e.ist_sichtbar  = true
            ORDER BY e.erstellt_am DESC
        `, [collId]);

        res.json({ ...coll, entries: entriesRes.rows });

    } catch (err) {
        console.error('[Collections] GET /api/collections/:id:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// ─── POST /api/collections ────────────────────────────────────────
// Neue Sammlung erstellen
app.post('/api/collections', async (req, res) => {
    try {
        const nutzer = await getNutzerAusSession(req);
        const { title, description, category, tags = [] } = req.body;

        if (!title?.trim())     return res.status(400).json({ error: 'Titel ist Pflichtfeld' });
        if (!category?.trim())  return res.status(400).json({ error: 'Kategorie ist Pflichtfeld' });
        if (title.length > 255) return res.status(400).json({ error: 'Titel zu lang (max 255)' });

        const username = nutzer?.benutzername || 'Gast';
        const nutzerId = nutzer?.id           || null;

        const result = await pool.query(`
            INSERT INTO public.collections
                (titel, beschreibung, kategorie, tags, erstellt_von, nutzer_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING
                id,
                titel        AS title,
                beschreibung AS description,
                kategorie    AS category,
                tags,
                erstellt_am
        `, [
            title.trim(),
            description?.trim() || null,
            category.trim(),
            Array.isArray(tags) ? tags : [],
            username,
            nutzerId,
        ]);

        res.status(201).json(result.rows[0]);

    } catch (err) {
        console.error('[Collections] POST /api/collections:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// ─── POST /api/collections/add ────────────────────────────────────
// Link + Empfehlung hinzufügen
app.post('/api/collections/add', async (req, res) => {
    try {
        const nutzer = await getNutzerAusSession(req);
        const { url, collectionId, title, reason } = req.body;

        if (!url?.trim())    return res.status(400).json({ error: 'URL fehlt' });
        if (!collectionId)   return res.status(400).json({ error: 'Sammlung fehlt' });
        if (!reason?.trim()) return res.status(400).json({ error: 'Empfehlung fehlt' });
        if (reason.trim().length < 15)
            return res.status(400).json({ error: 'Empfehlung zu kurz (min. 15 Zeichen)' });

        try { new URL(url.trim()); } catch {
            return res.status(400).json({ error: 'Ungültige URL' });
        }

        // Sammlung existiert und ist nicht versteckt?
        const collRes = await pool.query(
            'SELECT id, ist_versteckt FROM public.collections WHERE id = $1',
            [parseInt(collectionId)]
        );
        if (!collRes.rows[0])
            return res.status(404).json({ error: 'Sammlung nicht gefunden' });
        if (collRes.rows[0].ist_versteckt)
            return res.status(403).json({ error: 'Sammlung nicht verfügbar' });

        // Trust-Check: sofort sichtbar?
        let istSichtbar = false;
        if (nutzer) {
            const pruefung = stimmenSichtbarPruefen(nutzer);
            istSichtbar    = pruefung.sichtbar;
        }

        const username = nutzer?.benutzername || 'Gast';
        const nutzerId = nutzer?.id           || null;

        const result = await pool.query(`
            INSERT INTO public.collection_eintraege
                (collection_id, url, titel, empfehlung,
                 nutzername, nutzer_id, ist_sichtbar, ist_versteckt)
            VALUES ($1, $2, $3, $4, $5, $6, $7, false)
            RETURNING
                id,
                url,
                titel,
                empfehlung  AS reason,
                nutzername  AS username,
                erstellt_am,
                ist_sichtbar
        `, [
            parseInt(collectionId),
            url.trim(),
            title?.trim() || null,
            reason.trim(),
            username,
            nutzerId,
            istSichtbar,
        ]);

        res.status(201).json({
            ...result.rows[0],
            visible: istSichtbar,
            message: istSichtbar
                ? 'Link ist jetzt live.'
                : 'Link gespeichert – erscheint sobald dein Vertrauen ausreicht.',
        });

    } catch (err) {
        console.error('[Collections] POST /api/collections/add:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// ─── POST /api/collections/:id/like ──────────────────────────────
app.post('/api/collections/:id/like', async (req, res) => {
    try {
        const nutzer = await getNutzerAusSession(req);
        if (!nutzer) return res.status(401).json({ error: 'Nicht angemeldet' });

        const collId = parseInt(req.params.id);

        // Bereits geliked?
        const existing = await pool.query(
            'SELECT id FROM public.collection_likes WHERE collection_id = $1 AND nutzer_id = $2',
            [collId, nutzer.id]
        );
        if (existing.rows[0])
            return res.status(409).json({ error: 'Bereits geliked', alreadyLiked: true });

        await pool.query('BEGIN');
        await pool.query(
            'INSERT INTO public.collection_likes (collection_id, nutzer_id) VALUES ($1, $2)',
            [collId, nutzer.id]
        );
        const result = await pool.query(`
            UPDATE public.collections
            SET likes_anzahl = likes_anzahl + 1
            WHERE id = $1 AND ist_versteckt = false
            RETURNING id, likes_anzahl AS "likeCount"
        `, [collId]);
        await pool.query('COMMIT');

        if (!result.rows[0]) {
            await pool.query('ROLLBACK').catch(() => {});
            return res.status(404).json({ error: 'Sammlung nicht gefunden' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error('[Collections] POST /api/collections/:id/like:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

// ─── DELETE /api/collections/:id/like ────────────────────────────
app.delete('/api/collections/:id/like', async (req, res) => {
    try {
        const nutzer = await getNutzerAusSession(req);
        if (!nutzer) return res.status(401).json({ error: 'Nicht angemeldet' });

        const collId = parseInt(req.params.id);

        await pool.query('BEGIN');
        const deleted = await pool.query(
            'DELETE FROM public.collection_likes WHERE collection_id = $1 AND nutzer_id = $2 RETURNING id',
            [collId, nutzer.id]
        );
        if (!deleted.rows[0]) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Like nicht gefunden' });
        }
        const result = await pool.query(`
            UPDATE public.collections
            SET likes_anzahl = GREATEST(0, likes_anzahl - 1)
            WHERE id = $1
            RETURNING id, likes_anzahl AS "likeCount"
        `, [collId]);
        await pool.query('COMMIT');

        res.json(result.rows[0]);

    } catch (err) {
        await pool.query('ROLLBACK').catch(() => {});
        console.error('[Collections] DELETE /api/collections/:id/like:', err);
        res.status(500).json({ error: 'Datenbankfehler' });
    }
});

}; // Ende module.exports