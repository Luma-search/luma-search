/**
 * Community Lists API
 */
const router = require('express').Router();
const { apiLimiter } = require('../../config/rate-limiter');
const { pool } = require('../../crawler_new/db.js');
const { validateContent, confirmContent } = require('../../modules/community-moderation');
const { checkBlacklist } = require('../../modules/community-moderation/blacklist-checker');
const { checkAIModeration, logModerationVerdict } = require('../../modules/community-moderation/ai-moderation');
const { checkInsults } = require('../../modules/community-moderation/insult-detector');
const { checkSemanticContent } = require('../../modules/semantic-content-moderation');
const { requireAdmin } = require('../../middleware/admin-auth');
const { requireNotBanned, recordViolation, banIPManual, unbanIP, getActiveBans, getIPHistory, extractIP } = require('../../modules/community-moderation/ip-blocker');
const { getModerationQueue, genehmigenMeldung, ablehnenMeldung } = require('../../modules/community-moderation/auto-hide');

/**
 * GET /api/community-lists
 * Query: ?q=elon+musk&min_rating=3.5&limit=5
 * Gibt passende Community-Listen zur Suchanfrage zurück,
 * gefiltert nach Mindestbewertung, sortiert nach Qualität.
 */
router.get('/api/community-lists', apiLimiter, async (req, res) => {
    const query     = (req.query.q || '').trim();
    const limit     = Math.min(parseInt(req.query.limit     || '5'),  20);
    const minRating = Math.min(parseFloat(req.query.min_rating || '3.5'), 5);

    if (!query) return res.json([]);

    try {
        const result = await pool.query(`
            SELECT 
                cl.id,
                cl.name as title,
                cl.erstellt_von as username,
                cl.beschreibung,
                0::numeric(3,1) as avg_rating,
                0::integer as rating_count,
                (SELECT COUNT(*) FROM community_liste_eintraege WHERE liste_id = cl.id)::integer as item_count
            FROM community_listen cl
            WHERE (cl.name ILIKE '%' || $1 || '%'
               OR cl.beschreibung ILIKE '%' || $1 || '%'
               OR cl.tags && ARRAY[LOWER($1)]
               OR cl.search_keywords ILIKE '%' || LOWER($1) || '%')
              AND cl.ist_versteckt IS NOT TRUE
            ORDER BY item_count DESC, cl.erstellt_am DESC
            LIMIT $2
        `, [query, limit]);

        console.log('✅ Community Lists Query Result:', result.rows);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Community Lists Error:', err.message);
        res.json([]);
    }
});

/**
 * POST /api/community-lists
 * Body: { title, description, username, tags }
 */
router.post('/api/community-lists', requireNotBanned, apiLimiter, async (req, res) => {
    const { title, description, username, tags } = req.body;

    if (!title || !username) {
        return res.status(400).json({ error: 'Titel und Username sind Pflichtfelder.' });
    }
    if (username.length > 50) {
        return res.status(400).json({ error: 'Eingabe zu lang.' });
    }

    // Client-IP
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() 
                  || req.ip 
                  || req.connection?.remoteAddress 
                  || req.socket?.remoteAddress 
                  || 'unknown';

    try {
        // 0.5. DIREKTE INSULTE (schneller als AI)
        const titleInsults = checkInsults(title);
        if (titleInsults.blocked) {
            await logModerationVerdict('liste', null, title, titleInsults.wort, 1.0, 'block', titleInsults.kategorie, clientIP, true, false);
            await recordViolation(clientIP, titleInsults.kategorie, title);
            return res.status(400).json({ 
                error: `❌ Titel: ${titleInsults.grund}`,
                kategorie: titleInsults.kategorie,
                methode: 'insult'
            });
        }
        if (titleInsults.geflaggt) {
            await logModerationVerdict('liste', null, title, titleInsults.wort, 1.0, 'flag', titleInsults.kategorie, clientIP, false, true);
        }

        // 1. AI-MODERATION (MIT KONTEXT)
        const aiTitle = await checkAIModeration(title, clientIP);
        if (aiTitle.blocked) {
            await logModerationVerdict('liste', null, title, aiTitle.muster, aiTitle.score, 'block', aiTitle.kategorie, clientIP, true, false);
            await recordViolation(clientIP, aiTitle.kategorie, title);
            return res.status(400).json({ 
                error: `❌ Titel: ${aiTitle.grund}`,
                kategorie: aiTitle.kategorie,
                methode: 'ai'
            });
        }
        if (aiTitle.geflaggt) {
            await logModerationVerdict('liste', null, title, aiTitle.muster, aiTitle.score, 'flag', aiTitle.kategorie, clientIP, false, true);
            // nur loggen, nicht blockieren
        }

        const aiDesc = await checkAIModeration(description || '', clientIP);
        if (aiDesc.blocked) {
            await logModerationVerdict('liste', null, description, aiDesc.muster, aiDesc.score, 'block', aiDesc.kategorie, clientIP, true, false);
            await recordViolation(clientIP, aiDesc.kategorie, description);
            return res.status(400).json({ 
                error: `❌ Beschreibung: ${aiDesc.grund}`,
                kategorie: aiDesc.kategorie,
                methode: 'ai'
            });
        }

        // Auch Insult-Check für Beschreibung (nur wenn Text nicht leer)
        if (description && description.trim()) {
            const descInsults = checkInsults(description);
            if (descInsults.blocked) {
                await logModerationVerdict('liste', null, description, descInsults.wort, 1.0, 'block', descInsults.kategorie, clientIP, true, false);
                return res.status(400).json({ 
                    error: `❌ Beschreibung: ${descInsults.grund}`,
                    kategorie: descInsults.kategorie,
                    methode: 'insult'
                });
            }
            if (descInsults.geflaggt) {
                await logModerationVerdict('liste', null, description, descInsults.wort, 1.0, 'flag', descInsults.kategorie, clientIP, false, true);
            }
        }
        if (aiDesc.geflaggt) {
            await logModerationVerdict('liste', null, description, aiDesc.muster, aiDesc.score, 'flag', aiDesc.kategorie, clientIP, false, true);
            // nur loggen, nicht blockieren
        }

        // 2. BLACKLIST-PRÜFUNG
        const titleBlacklist = await checkBlacklist(title);
        if (titleBlacklist.blocked) {
            return res.status(400).json({ 
                error: `❌ Titel (Blacklist): ${titleBlacklist.kategorie}`,
                methode: 'blacklist'
            });
        }

        const descBlacklist = await checkBlacklist(description);
        if (descBlacklist.blocked) {
            return res.status(400).json({ 
                error: `❌ Beschreibung (Blacklist): ${descBlacklist.kategorie}`,
                methode: 'blacklist'
            });
        }

        // 3. NORMALE MODERATION (mit AI-Moderation statt einfaches bad-words-filter)
        const modResult = await validateContent({ title, description }, 'list', 'lists');
        if (!modResult.ok) {
            return res.status(400).json({ error: modResult.reason, field: modResult.field });
        }

        const safeTags = Array.isArray(tags)
            ? tags.map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 20)
            : [];

        // IP-Löschfrist: 2 Wochen
        const ipLoeschfristAm = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        await pool.query(`
            INSERT INTO community_listen (name, beschreibung, erstellt_von, tags, erstellt_von_ip, ip_loeschfrist_am)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            title.trim(), 
            (description || '').trim() || null, 
            username.trim(), 
            safeTags.length > 0 ? safeTags : null,
            clientIP,
            ipLoeschfristAm
        ]);

        confirmContent({ title, description }, 'list', 'lists');

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('❌ Community Lists POST Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/community-lists/:id
 * Gibt eine einzelne Liste + alle Einträge zurück.
 */
router.get('/api/community-lists/:id', apiLimiter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Ungültige ID' });

    try {
        const listRes = await pool.query(
            `SELECT 
                id, 
                name as title, 
                beschreibung, 
                erstellt_von as username, 
                erstellt_am,
                0::numeric(3,1) as avg_rating,
                0::integer as rating_count
             FROM community_listen
             WHERE id = $1`, [id]);

        if (listRes.rows.length === 0) return res.status(404).json({ error: 'Liste nicht gefunden' });

        const itemsRes = await pool.query(
            `SELECT id, inhalt as content, nutzername as username, erstellt_am, COALESCE(is_solution, false) as is_solution
             FROM community_liste_eintraege 
             WHERE liste_id = $1 
               AND ist_versteckt IS NOT TRUE
             ORDER BY erstellt_am ASC`, [id]);

        res.json({ list: listRes.rows[0], items: itemsRes.rows });
    } catch (err) {
        console.error('❌ Community List Detail Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/community-lists/:id/items
 * Fügt einen Eintrag zu einer Liste hinzu.
 * Body: { content, username }
 */
router.post('/api/community-lists/:id/items', requireNotBanned, apiLimiter, async (req, res) => {
    const id = parseInt(req.params.id);
    const { content, username } = req.body;

    if (!id) return res.status(400).json({ error: 'Ungültige ID' });
    if (!content || !username) return res.status(400).json({ error: 'Inhalt und Username sind Pflichtfelder.' });
    if (username.length > 50) return res.status(400).json({ error: 'Eingabe zu lang.' });

    // Client-IP
    const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() 
                  || req.ip 
                  || req.connection?.remoteAddress 
                  || req.socket?.remoteAddress 
                  || 'unknown';

    try {
        // 0.5. DIREKTE INSULTE (schneller als AI)
        const contentInsults = checkInsults(content);
        if (contentInsults.blocked) {
            await logModerationVerdict('eintrag', id, content, contentInsults.wort, 1.0, 'block', contentInsults.kategorie, clientIP, true, false);
            await recordViolation(clientIP, contentInsults.kategorie, content);
            return res.status(400).json({ 
                error: `❌ Dein Kommentar: ${contentInsults.grund}`,
                kategorie: contentInsults.kategorie,
                methode: 'insult'
            });
        }

        // 1. AI-MODERATION
        const aiCheck = await checkAIModeration(content, clientIP);
        if (aiCheck.blocked) {
            await logModerationVerdict('eintrag', id, content, aiCheck.muster, aiCheck.score, 'block', aiCheck.kategorie, clientIP, true, false);
            await recordViolation(clientIP, aiCheck.kategorie, content);
            return res.status(400).json({ 
                error: `❌ ${aiCheck.grund}`,
                kategorie: aiCheck.kategorie,
                methode: 'ai'
            });
        }
        if (aiCheck.geflaggt) {
            await logModerationVerdict('eintrag', id, content, aiCheck.muster, aiCheck.score, 'flag', aiCheck.kategorie, clientIP, false, true);
            // nur loggen, nicht blockieren
        }


        // 2. BLACKLIST
        const contentBlacklist = await checkBlacklist(content);
        if (contentBlacklist.blocked) {
            await logModerationVerdict('eintrag', id, content, contentBlacklist.grund, contentBlacklist.prioritaet, 'block', contentBlacklist.kategorie, clientIP, true, false);
            return res.status(400).json({ 
                error: `❌ Dein Kommentar ist unangebracht (${contentBlacklist.kategorie})`,
                methode: 'blacklist'
            });
        }

        // 3. NORMALE MODERATION (mit AI-Moderation)
        const modResult = await validateContent({ content }, 'item', `items-${id}`);
        if (!modResult.ok) {
            return res.status(400).json({ error: modResult.reason, field: modResult.field });
        }

        // IP-Löschfrist: 2 Wochen
        const ipLoeschfristAm = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

        const result = await pool.query(
            `INSERT INTO community_liste_eintraege (liste_id, inhalt, nutzername, erstellt_von_ip, ip_loeschfrist_am) 
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [id, content.trim(), username.trim(), clientIP, ipLoeschfristAm]
        );

        confirmContent({ content }, 'item', `items-${id}`);

        res.status(201).json({ success: true });
    } catch (err) {
        console.error('❌ Community List Item Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/community-reports
 * Body: { report_type, target_id, reason, description }
 * Erstellt einen neuen Bericht für Community-Inhalte.
 */
router.post('/api/community-reports', apiLimiter, async (req, res) => {
    const { report_type, target_id, reason, description } = req.body;

    // Validierung
    const validTypes = ['list', 'item', 'comment'];
    const validReasons = ['spam', 'harassment', 'hate_speech', 'irrelevant', 'duplicate', 'other'];
    
    // Deutsche Mappings
    const typeMap = {
        'list': 'liste',
        'item': 'eintrag',
        'comment': 'kommentar'
    };
    
    const reasonMap = {
        'spam': 'spam',
        'harassment': 'belästigung',
        'hate_speech': 'hasspropaganda',
        'irrelevant': 'irrelevant',
        'duplicate': 'duplikat',
        'other': 'sonstiges'
    };

    if (!validTypes.includes(report_type)) {
        return res.status(400).json({ error: 'Ungültiger Report-Typ.' });
    }
    if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: 'Ungültiger Grund.' });
    }
    if (!target_id || target_id <= 0) {
        return res.status(400).json({ error: 'Ungültige Ziel-ID.' });
    }

    try {
        // Target existieren prüfen und IP extrahieren
        let targetTable = report_type === 'list' ? 'community_listen' 
                        : report_type === 'item' ? 'community_liste_eintraege'
                        : 'community_liste_eintraege'; // Für 'comment'
        
        const checkRes = await pool.query(
            `SELECT erstellt_von_ip FROM ${targetTable} WHERE id = $1`,
            [target_id]
        );
        
        if (checkRes.rows.length === 0) {
            return res.status(404).json({ error: 'Ziel-Inhalt nicht gefunden.' });
        }

        // IP des GEMELDETEN INHALTS (nicht des Meldenden!)
        const zielNutzerIP = checkRes.rows[0].erstellt_von_ip;

        // Client-IP des Meldenden
        const clientIP = req.headers['x-forwarded-for']?.split(',')[0].trim() 
                      || req.ip 
                      || req.connection?.remoteAddress 
                      || req.socket?.remoteAddress 
                      || req.connection?.socket?.remoteAddress
                      || 'unknown';

        // IP-Löschfrist für gemeldete Inhalte: 1 JAHR
        const ipLoeschfristAm = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

        // Report speichern in deutsche Tabelle
        await pool.query(`
            INSERT INTO gemeinschafts_meldungen 
                (meldungstyp, ziel_id, grund, beschreibung, gemeldet_am, gemeldet_von_ip, ziel_nutzer_ip, ip_loeschfrist_am)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5, $6, $7)
        `, [
            typeMap[report_type], 
            target_id, 
            reasonMap[reason], 
            description || null, 
            clientIP,
            zielNutzerIP,
            ipLoeschfristAm
        ]);

        res.status(201).json({ success: true, message: 'Vielen Dank für deinen Report.' });
    } catch (err) {
        console.error('❌ Community Report Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * ============================================
 * ADMIN ENDPUNKTE FÜR BLACKLIST-VERWALTUNG
 * ============================================
 */

/**
 * GET /api/admin/blacklist
 * Gibt alle Blacklist-Einträge zurück (nur für Admins)
 */
router.get('/api/admin/blacklist', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;
        const { getBlacklistAdmin } = require('../../modules/blacklist-checker');
        const blacklist = await getBlacklistAdmin();
        
        res.json({
            success: true,
            total: blacklist.length,
            eintraege: blacklist
        });
    } catch (err) {
        console.error('❌ Blacklist Admin GET Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/blacklist/add
 * Fügt einen neuen Eintrag zur Blacklist hinzu
 * Body: { pattern, typ, kategorie, prioritaet, aktion, beschreibung }
 */
router.post('/api/admin/blacklist/add', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;

        const { pattern, typ, kategorie, prioritaet, aktion, beschreibung } = req.body;

        if (!pattern || !kategorie) {
            return res.status(400).json({ error: 'Pattern und Kategorie sind erforderlich.' });
        }

        const { addToBlacklist } = require('../../modules/blacklist-checker');
        const result = await addToBlacklist(
            pattern, 
            typ || 'phrase', 
            kategorie, 
            prioritaet || 0, 
            aktion || 'block', 
            beschreibung, 
            adminUser
        );

        if (result.success) {
            res.status(201).json({ 
                success: true, 
                message: `✅ "${pattern}" zur Blacklist hinzugefügt` 
            });
        } else {
            res.status(400).json({ error: result.fehler });
        }
    } catch (err) {
        console.error('❌ Blacklist Add Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/admin/blacklist/:id
 * Entfernt einen Eintrag aus der Blacklist (deaktiviert ihn)
 */
router.delete('/api/admin/blacklist/:id', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;

        const id = parseInt(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Ungültige ID.' });
        }

        const { removeFromBlacklist } = require('../../modules/blacklist-checker');
        const result = await removeFromBlacklist(id, adminUser);

        if (result.success) {
            res.json({ 
                success: true, 
                message: `✅ Blacklist-Eintrag #${id} deaktiviert` 
            });
        } else {
            res.status(400).json({ error: result.fehler });
        }
    } catch (err) {
        console.error('❌ Blacklist Delete Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/admin/blacklist/stats
 * Gibt Statistiken über die Blacklist zurück
 */
router.get('/api/admin/blacklist/stats', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;

        const result = await pool.query(`
            SELECT 
                kategorie,
                COUNT(*) as total,
                SUM(CASE WHEN ist_aktiv = TRUE THEN 1 ELSE 0 END) as aktiv,
                SUM(CASE WHEN ist_aktiv = FALSE THEN 1 ELSE 0 END) as inaktiv,
                AVG(prioritaet) as durchschn_prioritaet,
                STRING_AGG(DISTINCT aktion, ', ') as aktionen
            FROM gemeinschafts_blackliste
            GROUP BY kategorie
            ORDER BY total DESC
        `);

        res.json({
            success: true,
            statistiken: result.rows
        });
    } catch (err) {
        console.error('❌ Blacklist Stats Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * ============================================
 * ADMIN ENDPUNKTE FÜR SEMANTISCHE MODERATION
 * ============================================
 */

/**
 * GET /api/admin/semantic-blacklist
 * Gibt alle problematischen Sätze zurück
 */
router.get('/api/admin/semantic-blacklist', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;

        const { getProblematicSentences } = require('../../modules/semantic-content-moderation');
        const sentences = await getProblematicSentences();
        
        res.json({
            success: true,
            total: sentences.length,
            saetze: sentences
        });
    } catch (err) {
        console.error('❌ Semantic Blacklist GET Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/semantic-blacklist/add
 * Fügt einen problematischen Satz zur Blacklist hinzu
 * Body: { satz, kategorie, aktion, prioritaet, beschreibung }
 */
router.post('/api/admin/semantic-blacklist/add', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;

        const { satz, kategorie, aktion, prioritaet, beschreibung } = req.body;

        if (!satz || !kategorie) {
            return res.status(400).json({ error: 'Satz und Kategorie sind erforderlich.' });
        }

        const { addProblematicSentence } = require('../../modules/semantic-content-moderation');
        const result = await addProblematicSentence(
            satz,
            kategorie,
            aktion || 'block',
            prioritaet || 50,
            beschreibung,
            adminUser
        );

        if (result.success) {
            res.status(201).json({ 
                success: true, 
                message: `✅ Satz zur KI-Blacklist hinzugefügt (ID: ${result.id})`,
                id: result.id
            });
        } else {
            res.status(400).json({ error: result.fehler });
        }
    } catch (err) {
        console.error('❌ Semantic Blacklist Add Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/admin/semantic-blacklist/:id
 * Entfernt einen problematischen Satz
 */
router.delete('/api/admin/semantic-blacklist/:id', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;

        const id = parseInt(req.params.id);
        if (!id) {
            return res.status(400).json({ error: 'Ungültige ID.' });
        }

        const { removeProblematicSentence } = require('../../modules/semantic-content-moderation');
        const result = await removeProblematicSentence(id, adminUser);

        if (result.success) {
            res.json({ 
                success: true, 
                message: `✅ Satz aus KI-Blacklist entfernt (ID: ${id})` 
            });
        } else {
            res.status(400).json({ error: result.fehler });
        }
    } catch (err) {
        console.error('❌ Semantic Blacklist Delete Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/admin/semantic-blacklist/test
 * Test: Wie ähnlich ist ein Text zu problematischen Sätzen?
 * Body: { text, threshold }
 */
router.post('/api/admin/semantic-blacklist/test', requireAdmin, async (req, res) => {
    try {
        const adminUser = req.adminUser;

        const { text, threshold } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'Text ist erforderlich.' });
        }

        const { checkSemanticContent } = require('../../modules/semantic-content-moderation');
        const result = await checkSemanticContent(text, threshold || 0.85);

        res.json({
            success: true,
            text: text,
            blocked: result.blocked,
            flagged: result.flagged,
            matches: result.matching_sentences,
            message: result.reason
        });
    } catch (err) {
        console.error('❌ Semantic Test Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});


/**
 * POST /api/community-lists/items/:id/solution
 */
router.post('/api/community-lists/items/:id/solution', apiLimiter, async (req, res) => {
    const id          = parseInt(req.params.id);
    const is_solution = req.body.is_solution === true;
    if (!id) return res.status(400).json({ error: 'Ungültige ID' });
    try {
        await pool.query(`ALTER TABLE community_liste_eintraege ADD COLUMN IF NOT EXISTS is_solution boolean DEFAULT false`);
        const result = await pool.query(
            `UPDATE community_liste_eintraege SET is_solution = $1 WHERE id = $2 RETURNING id, is_solution`,
            [is_solution, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
        res.json({ success: true, id, is_solution });
    } catch (err) {
        console.error('❌ Solution update error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * ============================================
 * ADMIN ENDPUNKTE FÜR IP-SPERRUNG
 * ============================================
 */

/** GET /api/admin/ip-bans — alle aktiven Sperren */
router.get('/api/admin/ip-bans', requireAdmin, async (req, res) => {
    try {
        const bans = await getActiveBans();
        res.json({ success: true, total: bans.length, sperren: bans });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /api/admin/ip-bans/:ip — Historie einer IP */
router.get('/api/admin/ip-bans/:ip', requireAdmin, async (req, res) => {
    try {
        const ip      = req.params.ip;
        const history = await getIPHistory(ip);
        res.json({ success: true, ip, history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/admin/ip-bans — IP manuell sperren
 *  Body: { ip, grund, permanent, stundenDauer }
 */
router.post('/api/admin/ip-bans', requireAdmin, async (req, res) => {
    const { ip, grund, permanent = false, stundenDauer = 24 } = req.body;
    if (!ip || !grund) return res.status(400).json({ error: 'ip und grund sind Pflichtfelder.' });

    const result = await banIPManual(ip, grund, permanent, stundenDauer, req.adminUser);
    if (result.success) {
        res.status(201).json({ success: true, message: `✅ ${ip} gesperrt` });
    } else {
        res.status(500).json({ error: result.fehler });
    }
});

/** DELETE /api/admin/ip-bans/:ip — Sperre aufheben */
router.delete('/api/admin/ip-bans/:ip', requireAdmin, async (req, res) => {
    const result = await unbanIP(req.params.ip, req.adminUser);
    if (result.success) {
        res.json({ success: true, message: `✅ Sperre für ${req.params.ip} aufgehoben` });
    } else {
        res.status(500).json({ error: result.fehler });
    }
});

/**
 * ============================================
 * ADMIN ENDPUNKTE FÜR AUTO-HIDE / MODERATION-QUEUE
 * ============================================
 */

/** GET /api/admin/moderation-queue — alle versteckten/gemeldeten Inhalte */
router.get('/api/admin/moderation-queue', requireAdmin, async (req, res) => {
    try {
        const queue = await getModerationQueue();
        res.json({ success: true, ...queue });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/admin/moderation-queue/genehmigen
 *  Verstoß bestätigt → Inhalt wird gelöscht
 *  Body: { typ: 'liste'|'eintrag', id, notiz? }
 */
router.post('/api/admin/moderation-queue/genehmigen', requireAdmin, async (req, res) => {
    const { typ, id, notiz } = req.body;
    if (!typ || !id) return res.status(400).json({ error: 'typ und id sind Pflichtfelder.' });
    const result = await genehmigenMeldung(typ, parseInt(id), req.adminUser, notiz || '');
    result.success
        ? res.json({ success: true, message: `🗑️ ${typ} #${id} gelöscht — Meldung genehmigt` })
        : res.status(500).json({ error: result.fehler });
});

/** POST /api/admin/moderation-queue/ablehnen
 *  Kein Verstoß → Inhalt wird wieder sichtbar
 *  Body: { typ: 'liste'|'eintrag', id, notiz? }
 */
router.post('/api/admin/moderation-queue/ablehnen', requireAdmin, async (req, res) => {
    const { typ, id, notiz } = req.body;
    if (!typ || !id) return res.status(400).json({ error: 'typ und id sind Pflichtfelder.' });
    const result = await ablehnenMeldung(typ, parseInt(id), req.adminUser, notiz || '');
    result.success
        ? res.json({ success: true, message: `✅ ${typ} #${id} freigegeben — Meldung abgelehnt` })
        : res.status(500).json({ error: result.fehler });
});

module.exports = router;