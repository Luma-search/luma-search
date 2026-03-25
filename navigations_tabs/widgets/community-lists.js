// --- COMMUNITY LISTS - Inline Detail, Einträge, Kommentare ---

const _clCache = new Map();
const CL_CACHE_TTL = 0; // Cache deaktiviert - bei jeder Suche neu laden

export const CommunityLists = {

    _stylesInjected: false,

    _injectStyles() {
        if (this._stylesInjected) return;
        this._stylesInjected = true;
        const style = document.createElement('style');
        style.textContent = `
            .cl-section {
                font-family: 'Google Sans', 'Roboto', Arial, sans-serif;
                color: #e8eaed;
                margin-bottom: 30px;
                margin-top: 20px;
            }
            .cl-heading {
                font-size: 20px;
                color: #e8eaed;
                font-weight: 400;
                margin-bottom: 16px;
                padding: 0 4px;
            }
            
            /* Modern Card Style */
            .cl-card-wrapper {
                display: flex;
                align-items: stretch;
                background: #202124;
                border: 1px solid #3c4043;
                border-radius: 12px;
                margin-bottom: 12px;
                transition: transform 0.2s, border-color 0.2s, background-color 0.2s;
                position: relative;
            }
            .cl-card-wrapper:hover {
                border-color: #5f6368;
                background: #303134;
                transform: translateY(-1px);
            }

            .cl-card {
                flex: 1;
                background: none;
                border: none;
                padding: 16px;
                text-align: left;
                cursor: pointer;
                outline: none;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }

            .cl-card-menu {
                background: none;
                border: none;
                color: #9aa0a6;
                width: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                cursor: pointer;
                border-left: 1px solid #3c4043;
                transition: color 0.2s, background 0.2s;
                border-radius: 0 12px 12px 0;
            }
            .cl-card-menu:hover {
                color: #e8eaed;
                background: rgba(255,255,255,0.05);
            }
            
            /* Menü-Popup */
            .cl-menu-popup {
                position: absolute;
                top: 45px;
                right: 5px;
                background: #303134;
                border: 1px solid #5f6368;
                border-radius: 6px;
                box-shadow: 0 4px 16px rgba(0,0,0,0.6);
                z-index: 1000;
                min-width: 180px;
                padding: 6px 0;
                animation: cl-popup-in 0.15s ease-out;
            }
            @keyframes cl-popup-in {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .cl-menu-item {
                display: block;
                width: 100%;
                text-align: left;
                padding: 10px 16px;
                background: none;
                border: none;
                color: #e8eaed;
                font-size: 13px;
                cursor: pointer;
            }
            .cl-menu-item:hover {
                background: rgba(138,180,248,0.1);
                color: #8ab4f8;
            }

            .cl-card-title {
                font-size: 16px;
                color: #8ab4f8;
                font-weight: 500;
                margin-bottom: 6px;
                line-height: 1.4;
            }
            
            .cl-card-meta {
                font-size: 12px;
                color: #9aa0a6;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .cl-badge {
                background: rgba(138,180,248,0.1);
                color: #8ab4f8;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 500;
                border: 1px solid rgba(138,180,248,0.2);
            }

            .cl-empty {
                padding: 12px 20px;
                font-size: 12.5px;
                color: #9aa0a6;
                font-style: italic;
            }

            /* Footer Buttons */
            .cl-footer {
                display: flex;
                gap: 12px;
                margin-top: 20px;
            }
            .cl-footer-btn {
                flex: 1;
                padding: 10px 0;
                background: #303134;
                border: 1px solid #3c4043;
                border-radius: 18px;
                color: #8ab4f8;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                text-align: center;
            }
            .cl-footer-btn:hover {
                background: rgba(138,180,248,0.08);
                border-color: #5f6368;
            }

            /* Erstell-Formular */
            .cl-form {
                background: #202124;
                border-top: 1px solid #3c4043;
                border: 1px solid #3c4043;
                border-radius: 12px;
                padding: 20px;
                margin-top: 20px;
                display: none;
            }
            .cl-form.open { display: block; animation: fadeIn 0.3s; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

            .cl-form-title {
                font-size: 16px;
                color: #e8eaed;
                font-weight: 500;
                margin-bottom: 16px;
            }
            .cl-input {
                width: 100%;
                background: #303134;
                border: 1px solid #3c4043;
                border-radius: 8px;
                color: #e8eaed;
                font-size: 14px;
                padding: 12px;
                margin-bottom: 12px;
                box-sizing: border-box;
                outline: none;
                transition: border-color 0.2s;
                resize: vertical;
            }
            .cl-input:focus { border-color: #8ab4f8; }
            .cl-input::placeholder { color: #5f6368; }
            .cl-input-hint {
                font-size: 11px;
                color: #5f6368;
                margin-top: -5px;
                margin-bottom: 8px;
            }
            .cl-submit {
                background: #8ab4f8;
                color: #202124;
                border: none;
                border-radius: 20px;
                padding: 10px 24px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                float: right;
                transition: background 0.2s;
            }
            .cl-submit:hover { background: #aecbfa; }
            .cl-submit:disabled { background: #3c4043; color: #9aa0a6; cursor: not-allowed; }
            .cl-msg { font-size: 13px; padding: 6px 0; clear: both; padding-top: 15px; }
            .cl-msg.ok  { color: #4caf50; }
            .cl-msg.err { color: #f44336; }

            /* Detail Ansicht */
            .cl-back-btn {
                background: none; border: none; color: #8ab4f8; 
                cursor: pointer; font-size: 14px; margin-bottom: 16px; 
                display: flex;
                align-items: center; gap: 6px;
                padding: 0;
            }
            .cl-back-btn:hover { text-decoration: underline; }

            .cl-detail-header {
                background: #202124;
                border: 1px solid #3c4043;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
            }
            .cl-detail-title {
                font-size: 22px;
                color: #e8eaed;
                margin-bottom: 8px;
            }
            .cl-detail-meta {
                font-size: 12px;
                color: #9aa0a6;
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
                margin-bottom: 6px;
            }
            .cl-detail-desc {
                font-size: 14px;
                color: #bdc1c6;
                line-height: 1.6;
                margin-top: 12px;
            }
            .cl-items-heading {
                font-size: 18px;
                color: #e8eaed;
                margin-bottom: 12px;
                margin-top: 30px;
            }
            .cl-item {
                background: #202124;
                border: 1px solid #3c4043;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 10px;
            }
            .cl-item-content {
                font-size: 15px;
                color: #e8eaed;
                line-height: 1.5;
            }
            .cl-item-meta {
                margin-top: 8px;
                font-size: 12px;
                color: #9aa0a6;
            }
            .cl-no-items {
                padding: 12px 20px;
                font-size: 12.5px;
                color: #9aa0a6;
                font-style: italic;
            }
            .cl-add-heading {
                font-size: 18px;
                color: #e8eaed;
                margin-bottom: 12px;
                margin-top: 30px;
            }
            .cl-add-form {
                /* Inherits from cl-form styles mostly, but wrapper needed */
            }
            /* Skeleton */
            .cl-skeleton-line {
                background: linear-gradient(90deg, #2a2a2a 25%, #333 50%, #2a2a2a 75%);
                background-size: 200% 100%;
                animation: cl-shimmer 1.4s infinite;
                border-radius: 4px;
                height: 12px;
                margin-bottom: 6px;
            }
            @keyframes cl-shimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        `;
        document.head.appendChild(style);
    },

    _skeleton() {
        return `<div class="cl-section">
            <div class="cl-heading">Community-Wissen</div>
            ${[1,2].map(() => `<div style="padding:10px 20px;">
                <div class="cl-skeleton-line" style="width:80%;"></div>
                <div class="cl-skeleton-line" style="width:50%;height:9px;"></div>
            </div>`).join('')}
        </div>`;
    },

    _buildStars(avg) {
        const r = Math.round(avg);
        return '★'.repeat(r) + '☆'.repeat(5 - r);
    },

    _escape(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1)  return 'gerade eben';
        if (m < 60) return `vor ${m} Min.`;
        const h = Math.floor(m / 60);
        if (h < 24) return `vor ${h} Std.`;
        return `vor ${Math.floor(h / 24)} Tagen`;
    },

    // ── Listenübersicht ──────────────────────────────────────
    _buildOverview(container, lists, query) {
        let html = `<div class="cl-section"><div class="cl-heading">Community-Wissen</div>`;

        if (!lists || lists.length === 0) {
            html += `<div class="cl-empty">Noch keine Listen zu „${this._escape(query)}".</div>`;
        } else {
            lists.forEach(list => {
                const rating = parseFloat(list.avg_rating) || 0;
                const count  = parseInt(list.rating_count) || 0;
                const items  = parseInt(list.item_count)   || 0;
                html += `
                    <div class="cl-card-wrapper">
                        <button class="cl-card" data-list-id="${list.id}">
                            <span class="cl-card-title">${this._escape(list.title)}</span>
                            <div class="cl-card-meta">
                                <span>von @${this._escape(list.username)}</span>
                                ${items > 0 ? `<span class="cl-badge">${items} Einträge</span>` : ''}
                            </div>
                        </button>
                        <div style="position: relative; flex-shrink: 0;">
                            <button class="cl-card-menu" data-list-id="${list.id}" title="Optionen">⋯</button>
                            <div class="cl-menu-popup" data-menu-id="${list.id}" style="display:none;">
                                <button class="cl-menu-item" data-action="spam">Als Spam melden</button>
                                <button class="cl-menu-item" data-action="harassment">Belästigung melden</button>
                                <button class="cl-menu-item" data-action="hate_speech">Hasspropaganda melden</button>
                            </div>
                        </div>
                    </div>`;
            });
        }

        html += `
            <div class="cl-footer">
                ${lists && lists.length > 0
                    ? `<button class="cl-footer-btn" id="cl-all-btn">Alle anzeigen →</button>`
                    : `<button class="cl-footer-btn" disabled>Noch keine Listen</button>`
                }
                <button class="cl-footer-btn" id="cl-create-btn">+ Liste erstellen</button>
            </div>
            <div class="cl-form" id="cl-form">
                <div class="cl-form-title">Neue Liste zu „${this._escape(query)}" erstellen</div>
                <input class="cl-input" id="cl-input-title" type="text" placeholder="Titel der Liste *" maxlength="200">
                <input class="cl-input" id="cl-input-desc"  type="text" placeholder="Kurze Beschreibung (optional)" maxlength="300">
                <input class="cl-input" id="cl-input-user"  type="text" placeholder="Dein Username (optional)" maxlength="50">
                <input class="cl-input" id="cl-input-tags"  type="text" value="${this._escape(query.toLowerCase())}" maxlength="200">
                <div class="cl-input-hint">Tags kommagetrennt — z.B. „elon musk, spacex"</div>
                <button class="cl-submit" id="cl-submit-btn">Liste veröffentlichen</button>
                <div class="cl-msg" id="cl-msg"></div>
            </div>
        </div>`;

        container.innerHTML = html;

        // Klick auf Karte → Detail öffnen
        container.querySelectorAll('.cl-card[data-list-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._openDetail(container, parseInt(btn.dataset.listId), query);
            });
        });

        // Menü-Button Click Handler
        container.querySelectorAll('.cl-card-menu').forEach(menuBtn => {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const listId = menuBtn.dataset.listId;
                const popup = menuBtn.parentElement.querySelector(`.cl-menu-popup[data-menu-id="${listId}"]`);
                const wrapper = menuBtn.closest('.cl-card-wrapper');
                if (!popup || !wrapper) return;
                
                const isOpening = popup.style.display === 'none';
                
                // Alle anderen Popups schließen + Z-Index zurücksetzen
                container.querySelectorAll('.cl-menu-popup').forEach(p => {
                    p.style.display = 'none';
                    const w = p.closest('.cl-card-wrapper');
                    if (w) w.style.zIndex = '';
                });
                
                if (isOpening) {
                    popup.style.display = 'block';
                    wrapper.style.zIndex = '100'; // Karte hervorheben
                }
            });
        });

        // Menü-Items Click Handler
        container.querySelectorAll('.cl-menu-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = item.dataset.action;
                const popup = item.closest('.cl-menu-popup');
                const menuId = popup.dataset.menuId;
                
                const reasonMap = {
                    'spam': 'spam',
                    'harassment': 'harassment',
                    'hate_speech': 'hate_speech'
                };
                
                await this._submitReport('list', parseInt(menuId), reasonMap[action], 'User report');
                
                // Popup schließen
                popup.style.display = 'none';
            });
        });

        // Außerhalb klicken → Popup schließen
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.cl-card-menu') && !e.target.closest('.cl-menu-popup')) {
                container.querySelectorAll('.cl-menu-popup').forEach(p => p.style.display = 'none');
            }
        });

        // Alle anzeigen → mehr Listen laden
        document.getElementById('cl-all-btn')?.addEventListener('click', async () => {
            const btn = document.getElementById('cl-all-btn');
            btn.textContent = 'Lädt…';
            btn.disabled = true;
            try {
                const res = await fetch(
                    `/api/community-lists?q=${encodeURIComponent(query)}&min_rating=0&limit=20`,
                    { signal: AbortSignal.timeout(4000) }
                );
                const allLists = res.ok ? await res.json() : lists;
                _clCache.set(query.toLowerCase().trim(), { data: allLists, ts: Date.now() });
                this._buildOverview(container, allLists, query);
            } catch {
                btn.textContent = 'Alle anzeigen →';
                btn.disabled = false;
            }
        });

        // Formular toggle
        document.getElementById('cl-create-btn').addEventListener('click', () => {
            document.getElementById('cl-form').classList.toggle('open');
        });

        // Submit neue Liste
        document.getElementById('cl-submit-btn').addEventListener('click', async () => {
            await this._submitList(query, container);
        });
    },

    // ── Detailansicht ────────────────────────────────────────
    async _openDetail(container, listId, query) {
        // Skeleton
        container.innerHTML = `<div class="cl-section">
            <div style="padding:10px 20px;"><div class="cl-skeleton-line" style="width:60%;height:14px;"></div></div>
            ${[1,2,3].map(() => `<div style="padding:10px 20px;">
                <div class="cl-skeleton-line" style="width:90%;"></div>
                <div class="cl-skeleton-line" style="width:40%;height:9px;"></div>
            </div>`).join('')}
        </div>`;

        try {
            const res = await fetch(`/api/community-lists/${listId}`, { signal: AbortSignal.timeout(4000) });
            if (!res.ok) throw new Error();
            const { list, items } = await res.json();
            this._renderDetail(container, list, items, query);
        } catch {
            this._buildOverview(container, null, query);
        }
    },

    _renderDetail(container, list, items, query) {
        const rating = parseFloat(list.avg_rating) || 0;
        const count  = parseInt(list.rating_count) || 0;

        let html = `<div class="cl-section">
            <button class="cl-back-btn" id="cl-back-btn">← Zurück zur Übersicht</button>

            <div class="cl-detail-header">
                <div class="cl-detail-title">${this._escape(list.title)}</div>
                <div class="cl-detail-meta">
                    <span>von @${this._escape(list.username)}</span>
                </div>
                ${list.beschreibung ? `<div class="cl-detail-desc">${this._escape(list.beschreibung)}</div>` : ''}
            </div>

            <div class="cl-items-heading">Einträge (${items.length})</div>`;

        if (items.length === 0) {
            html += `<div class="cl-no-items">Noch keine Einträge – sei der Erste!</div>`;
        } else {
            items.forEach(item => {
                html += `
                    <div class="cl-card-wrapper" style="margin-bottom: 10px;">
                        <div class="cl-item" style="flex: 1; border: none; margin-bottom: 0; border-radius: 12px 0 0 12px;">
                            <div class="cl-item-content">${this._escape(item.content)}</div>
                            <div class="cl-item-meta">@${this._escape(item.username)} · ${this._timeAgo(item.erstellt_am)}</div>
                        </div>
                        <div style="position: relative; flex-shrink: 0; display: flex;">
                            <button class="cl-card-menu" data-item-id="${item.id}" title="Optionen" style="border-radius: 0 12px 12px 0;">⋯</button>
                            <div class="cl-menu-popup" data-item-menu-id="${item.id}" data-item-username="${this._escape(item.username || '')}" style="display:none;">
                                <button class="cl-menu-item" data-action="spam">Als Spam melden</button>
                                <button class="cl-menu-item" data-action="harassment">Belästigung melden</button>
                                <button class="cl-menu-item" data-action="hate_speech">Hasspropaganda melden</button>
                                <button class="cl-menu-item" data-action="block" style="color:#f44336;border-top:1px solid #3c4043;margin-top:4px;padding-top:10px;">Nutzer blockieren</button>
                            </div>
                        </div>
                    </div>`;
            });
        }

        html += `
            <div class="cl-add-heading">Eintrag hinzufügen</div>
            <div class="cl-add-form">
                <textarea class="cl-input" id="cl-item-content" rows="3"
                    placeholder="Dein Beitrag zur Liste…" maxlength="1000"></textarea>
                <input class="cl-input" id="cl-item-user" type="text"
                    placeholder="Dein Username (optional)" maxlength="50">
                <button class="cl-submit" id="cl-item-submit">Eintrag hinzufügen</button>
                <div class="cl-msg" id="cl-item-msg"></div>
            </div>
        </div>`;

        container.innerHTML = html;

        // Zurück
        document.getElementById('cl-back-btn').addEventListener('click', async () => {
            await this.render(container.id, query);
        });

        // Menü-Button für Einträge
        container.querySelectorAll('.cl-card-menu[data-item-id]').forEach(menuBtn => {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = menuBtn.dataset.itemId;
                const popup = menuBtn.parentElement.querySelector(`.cl-menu-popup[data-item-menu-id="${itemId}"]`);
                const wrapper = menuBtn.closest('.cl-card-wrapper');
                if (!popup || !wrapper) return;

                const isOpening = popup.style.display === 'none';
                
                // Andere Popups schließen + Z-Index zurücksetzen
                container.querySelectorAll('.cl-menu-popup').forEach(p => {
                    p.style.display = 'none';
                    const w = p.closest('.cl-card-wrapper');
                    if (w) w.style.zIndex = '';
                });
                
                if (isOpening) {
                    popup.style.display = 'block';
                    wrapper.style.zIndex = '100'; // Karte hervorheben
                }
            });
        });

        // Menü-Items für Einträge (Melde-Funktion)
        container.querySelectorAll('.cl-menu-item[data-action]').forEach(itemBtn => {
            itemBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = itemBtn.dataset.action;
                const popup = itemBtn.closest('.cl-menu-popup');
                const itemId = popup.dataset.itemMenuId;
                if (!itemId) return;

                const reasonMap = {
                    'spam': 'spam',
                    'harassment': 'harassment',
                    'hate_speech': 'hate_speech'
                };

                if (action === 'block') {
                    // Nutzer blockieren
                    const nutzername = popup.dataset.itemUsername || '';
                    popup.style.display = 'none';
                    const wrapper = popup.closest('.cl-card-wrapper');
                    if (wrapper) wrapper.style.zIndex = '';
                    await this._blockierenNutzer(nutzername, parseInt(itemId), container);
                } else {
                    // Report absenden
                    await this._submitReport('item', parseInt(itemId), reasonMap[action], 'User report on list entry');
                    popup.style.display = 'none';
                    const wrapper = popup.closest('.cl-card-wrapper');
                    if (wrapper) wrapper.style.zIndex = '';
                }
            });
        });

        // Eintrag submitten
        document.getElementById('cl-item-submit').addEventListener('click', async () => {
            await this._submitItem(container, list, items, query);
        });
    },

    // ── Neuen Eintrag speichern ──────────────────────────────
    async _submitItem(container, list, items, query) {
        const content = document.getElementById('cl-item-content')?.value.trim();
        const user    = (document.getElementById('cl-item-user')?.value.trim() || 'Anonym');
        const msgEl   = document.getElementById('cl-item-msg');
        const btn     = document.getElementById('cl-item-submit');

        if (!content) {
            msgEl.className = 'cl-msg err';
            msgEl.textContent = 'Beitrag ist erforderlich.';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Wird gespeichert…';

        try {
            const res = await fetch(`/api/community-lists/${list.id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, username: user })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

            // Neuen Eintrag lokal einfügen und neu rendern
            items.push({ content, username: user, created_at: new Date().toISOString() });
            list.item_count = (parseInt(list.item_count) || 0) + 1;
            this._renderDetail(container, list, items, query);

        } catch (e) {
            msgEl.className = 'cl-msg err';
            msgEl.textContent = `Fehler: ${e.message}`;
            btn.disabled = false;
            btn.textContent = 'Eintrag hinzufügen';
        }
    },

    // ── Neue Liste speichern ─────────────────────────────────
    async _submitList(query, container) {
        const title   = document.getElementById('cl-input-title')?.value.trim();
        const desc    = document.getElementById('cl-input-desc')?.value.trim();
        const user    = (document.getElementById('cl-input-user')?.value.trim() || 'Anonym');
        const tagsRaw = document.getElementById('cl-input-tags')?.value.trim();
        const msgEl   = document.getElementById('cl-msg');
        const btn     = document.getElementById('cl-submit-btn');

        if (!title) {
            msgEl.className = 'cl-msg err';
            msgEl.textContent = 'Titel ist erforderlich.';
            return;
        }

        const tags = tagsRaw
            ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
            : [query.toLowerCase()];

        btn.disabled = true;
        btn.textContent = 'Wird gespeichert…';

        try {
            const res = await fetch('/api/community-lists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: desc, username: user, tags })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

            msgEl.className = 'cl-msg ok';
            msgEl.textContent = '✓ Liste erstellt!';
            btn.textContent = 'Liste veröffentlichen';
            btn.disabled = false;

            _clCache.delete(query.toLowerCase().trim());

            setTimeout(async () => {
                document.getElementById('cl-form')?.classList.remove('open');
                await this.render(container.id, query);
            }, 1500);

        } catch (e) {
            msgEl.className = 'cl-msg err';
            msgEl.textContent = `Fehler: ${e.message}`;
            btn.disabled = false;
            btn.textContent = 'Liste veröffentlichen';
        }
    },

    async _blockierenNutzer(nutzername, itemId, container) {
        if (!nutzername || nutzername === 'Anonym') {
            alert('Anonyme Nutzer können nicht blockiert werden.');
            return;
        }

        if (!confirm(`Möchtest du @${nutzername} wirklich blockieren? Du siehst dann keine Einträge mehr von dieser Person.`)) {
            return;
        }

        try {
            const res = await fetch('/api/nutzer/blockieren', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ gesperrter_name: nutzername }),
            });

            if (res.status === 401) {
                alert('Du musst angemeldet sein um Nutzer zu blockieren.');
                return;
            }

            const daten = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(daten.error || `HTTP ${res.status}`);

            // Alle Einträge dieses Nutzers sofort ausblenden
            container.querySelectorAll('.cl-card-wrapper').forEach(card => {
                const meta = card.querySelector('.cl-item-meta');
                if (meta && meta.textContent.includes(`@${nutzername}`)) {
                    card.style.transition = 'opacity 0.3s';
                    card.style.opacity = '0';
                    setTimeout(() => card.remove(), 300);
                }
            });

            // Kurze Bestätigung
            const bestaetigung = document.createElement('div');
            bestaetigung.style.cssText = 'padding:10px 16px;color:#4caf50;font-size:0.82rem;';
            bestaetigung.textContent = `@${nutzername} wurde blockiert.`;
            container.prepend(bestaetigung);
            setTimeout(() => bestaetigung.remove(), 3000);

        } catch (e) {
            alert(`Fehler beim Blockieren: ${e.message}`);
        }
    },

    async _submitReport(type, targetId, reason, description) {
        try {
            const res = await fetch('/api/community-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    report_type: type,
                    target_id: targetId,
                    reason: reason,
                    description: description
                })
            });
            
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            
            console.log('✓ Report submitted:', data);
        } catch (e) {
            console.error('✗ Report submission failed:', e.message);
        }
    },

    // ── Haupt-Render ─────────────────────────────────────────
    async render(containerId, query) {
        const container = document.getElementById(containerId);
        if (!container || !query || query.trim() === '') return;

        console.log('🔄 CommunityLists.render() called for query:', query);

        this._injectStyles();
        container.innerHTML = this._skeleton();

        const cacheKey = query.toLowerCase().trim();
        const cached = _clCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < CL_CACHE_TTL) {
            console.log('💾 Using cached community lists for:', cacheKey);
            this._buildOverview(container, cached.data, query);
            return;
        }

        try {
            console.log('📡 Fetching community lists for:', query);
            const res = await fetch(
                `/api/community-lists?q=${encodeURIComponent(query)}&min_rating=0&limit=5`,
                { signal: AbortSignal.timeout(4000) }
            );
            const lists = res.ok ? await res.json() : [];
            console.log('✅ Community lists received:', lists);
            _clCache.set(cacheKey, { data: lists, ts: Date.now() });
            this._buildOverview(container, lists, query);
        } catch (err) {
            console.error('❌ CommunityLists error:', err);
            this._buildOverview(container, [], query);
        }
    }
};