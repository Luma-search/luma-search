'use strict';

// ─── State ────────────────────────────────────────────────────────
let _currentUser    = null;
let _collections    = [];
let _activeFilter   = 'all';
let _likedIds       = new Set();
let _currentTags    = [];
let _detailCollId   = null;

// ─── Init ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await Promise.all([loadCollections(), loadDiscovery()]);
    bindEvents();
});

function bindEvents() {
    const linkForm = document.getElementById('link-form');
    if (linkForm) linkForm.addEventListener('submit', handleAddLink);
    const createForm = document.getElementById('create-collection-form');
    if (createForm) createForm.addEventListener('submit', handleCreateCollection);
    const tagInput = document.getElementById('new-coll-tags');
    if (tagInput) {
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === ',' || e.key === 'Enter') { e.preventDefault(); addTag(tagInput.value); tagInput.value = ''; }
        });
        tagInput.addEventListener('blur', () => { if (tagInput.value.trim()) { addTag(tagInput.value); tagInput.value = ''; } });
    }
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            _activeFilter = btn.dataset.filter;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderGrid(_collections);
        });
    });
}

// ─── Tags ─────────────────────────────────────────────────────────
function addTag(raw) {
    const tag = raw.trim().toLowerCase().replace(/,/g, '').slice(0, 30);
    if (!tag || _currentTags.includes(tag) || _currentTags.length >= 10) return;
    _currentTags.push(tag);
    renderTagPreview();
}
function removeTag(tag) { _currentTags = _currentTags.filter(t => t !== tag); renderTagPreview(); }
function renderTagPreview() {
    const preview = document.getElementById('tag-preview');
    if (!preview) return;
    preview.innerHTML = _currentTags.map(tag =>
        `<span class="tag-chip">#${escapeHtml(tag)}<button type="button" onclick="removeTag('${escapeHtml(tag)}')">×</button></span>`
    ).join('');
}
window.removeTag = removeTag;

// ─── User ─────────────────────────────────────────────────────────
async function loadUser() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        _currentUser = data;
        const badge = document.querySelector('.status-highlight');
        if (badge) {
            badge.textContent = data.loggedIn ? (data.trustStatus?.bezeichnung || 'Angemeldet') : 'Gast';
            badge.style.color = data.loggedIn ? (data.trustStatus?.farbe || 'var(--positive)') : 'var(--muted)';
        }
        // Das "Sichtbarkeit"-Fenster wurde auf Wunsch entfernt.
    } catch (e) { console.error('[CM] Auth fehlgeschlagen:', e); }
}

// ─── Discovery ────────────────────────────────────────────────────
async function loadDiscovery() {
    const container = document.getElementById('discovery-chips');
    if (!container) return;
    try {
        const res   = await fetch('/api/collections?filter=top&limit=20');
        const data  = res.ok ? await res.json() : [];
        const lists = Array.isArray(data) ? data : (data.lists || []);
        const categories = {};
        lists.forEach(list => {
            const cat = list.category || 'Allgemein';
            if (!categories[cat]) categories[cat] = 0;
            categories[cat] += list.entryCount || 0;
        });
        if (Object.keys(categories).length === 0) {
            container.innerHTML = '<span style="font-size:12px;color:var(--muted);">Noch keine Kollektionen vorhanden.</span>';
            return;
        }
        container.innerHTML = Object.entries(categories).sort((a,b) => b[1]-a[1])
            .map(([cat, count]) =>
                `<a class="chip" href="/collection-category.html?category=${encodeURIComponent(cat)}">${escapeHtml(cat)}<span class="chip-count">${count}</span></a>`
            ).join('');
    } catch (e) {
        container.innerHTML = '<span style="font-size:12px;color:var(--muted);">Discovery nicht verfügbar.</span>';
    }
}

// ─── Collections ──────────────────────────────────────────────────
async function loadCollections() {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;
    try {
        const res  = await fetch('/api/collections?user=me');
        const data = res.ok ? await res.json() : [];
        if (data && data.lists) {
            _collections = data.lists;
            _likedIds    = new Set(data.likedIds.map(String));
        } else {
            _collections = Array.isArray(data) ? data : [];
        }
        populateSelects(_collections);
        renderGrid(_collections);
    } catch (e) {
        console.error('[CM] Collections laden fehlgeschlagen:', e);
    }
}

function populateSelects(lists) {
    ['link-collection', 'modal-collection'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = '<option value="" disabled selected>Sammlung wählen…</option>';
        lists.forEach(list => {
            const title = list.titel || list.title || 'Unbenannt';
            const opt = document.createElement('option');
            opt.value = list.id; opt.textContent = title; sel.appendChild(opt);
        });
        const newOpt = document.createElement('option');
        newOpt.value = '__new__'; newOpt.textContent = '+ Neue Sammlung erstellen…';
        sel.appendChild(newOpt);
    });
}

function renderGrid(lists) {
    const grid = document.getElementById('collection-grid');
    if (!grid) return;
    let filtered = lists;
    if (_activeFilter === 'mine')  filtered = lists.filter(l => l.isOwn);
    if (_activeFilter === 'liked') filtered = lists.filter(l => _likedIds.has(String(l.id)));
    let html = '';
    if (filtered.length === 0) {
        html += `<div class="empty-state" style="grid-column:1/-1;">
            <svg class="icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            <p>${_activeFilter === 'liked' ? 'Noch keine Sammlungen geliked.' : 'Noch keine Sammlungen vorhanden.'}</p>
        </div>`;
    } else { filtered.forEach(list => { html += buildCardHtml(list); }); }
    html += `<div class="collection-card new" onclick="openCreateModal()" role="button" tabindex="0">
        <svg class="icon" style="width:28px;height:28px;margin-bottom:8px;" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg><span style="font-weight:600;font-size:13px;">Neue Kollektion</span></div>`;
    grid.innerHTML = html;
}

function buildCardHtml(list) {
    // Mapping auf DB-Spaltennamen (Fallback auf englische Keys falls API transformiert)
    const title      = list.titel || list.title || 'Ohne Titel';
    const category   = list.kategorie || list.category;
    const desc       = list.beschreibung || list.description || '';
    const username   = list.erstellt_von || list.username || 'Unbekannt';
    const entryCount = list.eintraege_anzahl !== undefined ? list.eintraege_anzahl : (list.entryCount || 0);
    const likeCount  = list.likes_anzahl !== undefined ? list.likes_anzahl : (list.likeCount || 0);
    const liked      = _likedIds.has(String(list.id)) || list.isLiked;
    
    const initials   = username.substring(0, 2).toUpperCase();
    const weight     = list.ownerWeight ?? 1;
    const trustCls   = weight >= 0.75 ? 'full' : weight >= 0.25 ? 'partial' : 'pending';
    const trustLbl   = weight >= 0.75 ? '✓ Vertrauenswürdig' : weight >= 0.25 ? '~ Aufbauend' : '○ Neu';
    const tagsHtml   = Array.isArray(list.tags) && list.tags.length > 0
        ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px;">${list.tags.slice(0,4).map(t => `<span class="tag-chip" style="font-size:10px;padding:2px 7px;">#${escapeHtml(t)}</span>`).join('')}</div>` : '';
    return `
    <div class="collection-card" onclick="openDetailModal(event,${list.id},'${escapeHtml(title).replace(/'/g,'\\\'')}')"  >
        <div class="card-header">
            <div class="card-title">${escapeHtml(title)}</div>
            <div class="card-badge">${entryCount} Links</div>
        </div>
        ${category ? `<div class="card-category">
            <svg class="icon" viewBox="0 0 24 24"><path d="M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 3a4 4 0 1 0 8 0 4 4 0 0 0-8 0z"/></svg>
            <a href="/collection-category.html?category=${encodeURIComponent(category)}" onclick="event.stopPropagation()"
               style="color:var(--muted);text-decoration:none;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--muted)'">${escapeHtml(category)}</a>
        </div>` : ''}
        <div class="card-desc">${escapeHtml(desc || 'Keine Beschreibung.')}</div>
        ${tagsHtml}
        <div class="card-footer">
            <div class="card-author">
                <div class="avatar">${initials}</div>
                <span>${escapeHtml(username)}</span>
                <span class="trust-badge ${trustCls}">${trustLbl}</span>
            </div>
            <button class="like-btn ${liked ? 'liked' : ''}" onclick="handleLike(event,'${list.id}')">
                <svg viewBox="0 0 24 24" class="icon"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                <span class="like-count-${list.id}">${likeCount}</span>
            </button>
        </div>
    </div>`;
}

// ─── Detail Modal ─────────────────────────────────────────────────
window.openDetailModal = async function(event, id, title) {
    if (event.target.closest('.like-btn') || event.target.closest('a')) return;
    _detailCollId = id;
    document.getElementById('detail-modal-title').textContent = title;
    document.getElementById('detail-modal-meta').textContent  = 'Lade Infos…';
    document.getElementById('detail-modal').classList.add('open');
    switchTab('single');
    
    // Sicherheits-Check: Feld nur leeren, wenn es existiert
    const urlField = document.getElementById('detail-url');
    if (urlField) urlField.value = '';

    try {
        const res = await fetch(`/api/collections/${id}?t=${Date.now()}`);
        if (res.ok) {
            const data = await res.json();
            // DB-Spalten Mapping für Details
            let entries = [];
            if (Array.isArray(data)) entries = data;
            else entries = data.eintraege || data.entries || data.items || data.links || data.rows || [];
            const cat = data.kategorie || data.category || (Array.isArray(data) ? '—' : (data.kategorie||'—'));
            document.getElementById('detail-modal-meta').textContent =
                `${entries.length} Links · Kategorie: ${cat}`;
        }
    } catch {}
};
window.closeDetailModal = () => {
    document.getElementById('detail-modal').classList.remove('open');
    _detailCollId = null;
};

// ─── Tabs ─────────────────────────────────────────────────────────
window.switchTab = function(tab) {
    document.querySelectorAll('.detail-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('tab-single').style.display = tab === 'single' ? '' : 'none';
    const tabLinks = document.getElementById('tab-links');
    if (tabLinks) tabLinks.style.display = tab === 'links' ? '' : 'none';
    if (tab === 'links') loadDetailLinks();
};

async function loadDetailLinks() {
    const container = document.getElementById('detail-links-list');
    if (!_detailCollId || !container) return;
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px;">Lädt…</div>';
    try {
        // Cache-Buster (?t=...) erzwingt das Neuladen vom Server
        const res = await fetch(`/api/collections/${_detailCollId}?t=${Date.now()}`);
        if (!res.ok) { container.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px;">Fehler beim Laden.</div>'; return; }
        const data    = await res.json();
        
        // Fallback für DB-Spalten (eintraege) oder API-Formate
        let entries = [];
        if (Array.isArray(data)) entries = data;
        else entries = data.eintraege || data.entries || data.items || data.links || data.rows || [];
        
        console.log('[CM] Geladene Links:', entries); // Debugging: Zeigt Daten in Konsole

        if (entries.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);font-size:13px;">Noch keine Links in dieser Sammlung.</div>';
            return;
        }
        container.innerHTML = entries.map(e => {
            let domain = '';
            // URL bereinigen (falls &amp; in DB gespeichert wurde)
            const cleanUrl = (e.url || '').replace(/&amp;/g, '&');
            try { domain = new URL(cleanUrl).hostname.replace('www.',''); } catch {}
            
            // Nutze explizite DB-Spaltennamen: titel, empfehlung
            // Falls titel NULL ist (wie in deinem DB-Snippet), nimm Domain oder URL
            const displayTitle = e.titel || e.title || domain || cleanUrl;
            const reasonText = e.empfehlung || e.reason || "";
            const showReason = reasonText && reasonText !== "Hinzugefügt über Collection Manager";

            return `<div class="detail-link-item">
                <div class="detail-link-favicon"><img src="https://www.google.com/s2/favicons?domain=${domain}&sz=14" alt="" onerror="this.style.display='none'"></div>
                <div class="detail-link-info">
                    <a class="detail-link-url" href="${escapeHtml(cleanUrl)}" target="_blank" rel="noopener">${escapeHtml(displayTitle)}</a>
                    ${showReason ? `<div class="detail-link-reason">"${escapeHtml(reasonText)}"</div>` : ''}
                </div>
            </div>`;
        }).join('');
    } catch { container.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px;">Fehler beim Laden.</div>'; }
}

// ─── Einzeln im Detail-Modal ──────────────────────────────────────
window.handleDetailAddLink = async function() {
    const rawUrls = document.getElementById('detail-url')?.value || '';
    const urls = rawUrls.split('\n').map(u => u.trim()).filter(u => u.length > 0 && u.startsWith('http'));

    if (urls.length === 0) {
        showToast('Bitte geben Sie mindestens eine gültige URL ein.', 'error');
        return;
    }

    const btn = document.getElementById('detail-submit');
    if (btn) btn.disabled = true;
    const status = document.getElementById('detail-save-status');

    let successCount = 0;
    let errorCount = 0;

    for (const url of urls) {
        try {
            const res = await fetch('/api/collections/add', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    url, 
                    collectionId: _detailCollId,
                    reason: "Hinzugefügt über Collection Manager" // Automatische Empfehlung für Server-Validierung
                }),
            });
            if (res.ok) successCount++;
            else errorCount++;
        } catch { errorCount++; }
    }

    if (btn) btn.disabled = false;

    if (successCount > 0) {
        document.getElementById('detail-url').value = '';
        if (status) {
            status.textContent = `✓ ${successCount} gespeichert`;
            status.style.display = 'inline';
            setTimeout(() => { status.style.display = 'none'; status.textContent = '✓ Gespeichert'; }, 3000);
        }
        showToast(`✓ ${successCount} von ${urls.length} Link(s) hinzugefügt.`, errorCount > 0 ? 'info' : 'success');
        await loadCollections();
        switchTab('links');
    } else {
        showToast('Keine Links konnten hinzugefügt werden.', 'error');
    }
};

// ─── Like ─────────────────────────────────────────────────────────
async function handleLike(event, id) {
    event.stopPropagation();
    if (!_currentUser?.loggedIn) { showToast('Bitte anmelden um zu liken.', 'info'); return; }
    const btn   = event.currentTarget;
    const liked = _likedIds.has(String(id));
    btn.classList.add('loading');
    try {
        const res = await fetch(`/api/collections/${id}/like`, { method: liked ? 'DELETE' : 'POST' });
        if (res.status === 409) { _likedIds.add(String(id)); btn.classList.add('liked'); return; }
        if (res.ok) {
            const data = await res.json();
            if (liked) { _likedIds.delete(String(id)); btn.classList.remove('liked'); }
            else       { _likedIds.add(String(id));    btn.classList.add('liked'); }
            const countEl = document.querySelector(`.like-count-${id}`);
            if (countEl) countEl.textContent = data.likeCount ?? 0;
        } else { showToast('Like konnte nicht gespeichert werden.', 'error'); }
    } catch { showToast('Verbindungsfehler.', 'error'); }
    finally   { btn.classList.remove('loading'); }
}

// ─── Link Formular ────────────────────────────────────────────────
async function handleAddLink(e) {
    e.preventDefault();
    const url    = document.getElementById('link-url')?.value?.trim();
    const collId = document.getElementById('link-collection')?.value;
    if (collId === '__new__') { openCreateModal(); return; }
    if (!url || !collId) { showToast('Bitte URL und Sammlung wählen.', 'error'); return; }
    await submitLink({ url, collId }, 'link-submit', () => {
        e.target.reset();
    });
}

async function handleModalAddLink() {
    const url    = document.getElementById('modal-url')?.value?.trim();
    const collId = document.getElementById('modal-collection')?.value;
    if (collId === '__new__') { closeAddModal(); openCreateModal(); return; }
    if (!url || !collId) { showToast('Bitte URL und Sammlung wählen.', 'error'); return; }
    await submitLink({ url, collId }, 'modal-submit', () => {
        closeAddModal();
        document.getElementById('modal-url').value = '';
    });
}

async function submitLink({ url, collId, title, reason }, btnId, onSuccess) {
    const btn = document.getElementById(btnId);
    if (btn) btn.disabled = true;
    try {
        const res = await fetch('/api/collections/add', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                url, 
                collectionId: collId, 
                title: title || '',
                reason: reason || "Hinzugefügt über Collection Manager" // Pflichtfeld für DB füllen
            }),
        });
        if (res.ok) {
            const data = await res.json();
            showToast(data.visible === false ? '✓ Link gespeichert – erscheint sobald dein Vertrauen ausreicht.' : '✓ Link ist jetzt live!', data.visible === false ? 'info' : 'success');
            onSuccess?.(); await loadCollections();
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || 'Fehler beim Speichern.', 'error');
        }
    } catch { showToast('Verbindungsfehler.', 'error'); }
    finally { if (btn) btn.disabled = false; }
}

// ─── Sammlung erstellen ───────────────────────────────────────────
async function handleCreateCollection(e) {
    e.preventDefault();
    const title    = document.getElementById('new-coll-title')?.value?.trim();
    const category = document.getElementById('new-coll-category')?.value?.trim();
    const desc     = document.getElementById('new-coll-desc')?.value?.trim();
    if (!title || !category) { showToast('Titel und Kategorie sind Pflichtfelder.', 'error'); return; }
    const tagInput = document.getElementById('new-coll-tags');
    if (tagInput?.value?.trim()) addTag(tagInput.value);
    try {
        const res = await fetch('/api/collections', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category, description: desc, tags: _currentTags }),
        });
        if (res.ok) {
            const newColl = await res.json();
            closeCreateModal();
            showToast('✓ Sammlung erstellt! Jetzt URLs hinzufügen.', 'success');
            await loadCollections();
            await loadDiscovery();
            setTimeout(() => openDetailModal({ target: document.body }, newColl.id, newColl.title), 300);
        } else {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || 'Fehler beim Erstellen.', 'error');
        }
    } catch { showToast('Verbindungsfehler.', 'error'); }
}

// ─── Modals ───────────────────────────────────────────────────────
window.openCreateModal = () => {
    _currentTags = []; renderTagPreview();
    document.getElementById('create-modal').classList.add('open');
    setTimeout(() => document.getElementById('new-coll-title')?.focus(), 80);
};
window.closeCreateModal = () => {
    document.getElementById('create-modal').classList.remove('open');
    document.getElementById('create-collection-form')?.reset();
    _currentTags = []; renderTagPreview();
};
window.openAddModal = () => {
    document.getElementById('add-modal').classList.add('open');
    setTimeout(() => document.getElementById('modal-url')?.focus(), 80);
};
window.closeAddModal = () => { document.getElementById('add-modal').classList.remove('open'); };

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeCreateModal(); closeAddModal(); closeDetailModal(); }
});
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) { closeCreateModal(); closeAddModal(); closeDetailModal(); }
});

// ─── Helpers ──────────────────────────────────────────────────────
function updateCharCount(textarea, counterId, max) {
    const len = textarea.value.length;
    const el  = document.getElementById(counterId);
    if (!el) return;
    el.textContent = `${len} / ${max}`;
    el.className   = 'char-count' + (len > max ? ' over' : len > max * 0.85 ? ' warn' : '');
}

function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast  = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type]??'ℹ'}</span><span class="toast-text">${escapeHtml(msg)}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity='0'; toast.style.transition='opacity 0.3s'; setTimeout(() => toast.remove(), 320); }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}