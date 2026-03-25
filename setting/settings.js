/**
 * Luma · settings.js
 * ─────────────────────────────────────────────────────────────
 * Verwaltet alle Benutzereinstellungen für die Luma Suchmaschine.
 *
 * Architektur:
 *   - Nicht eingeloggt  → nur localStorage
 *   - Eingeloggt        → Cloud-Sync via /api/user/preferences (JSONB)
 *                         Cloud ist immer master bei Konflikt
 *
 * Einstellungs-Keys:
 *   luma_settings       → allgemeine Einstellungen (JSON)
 *   luma_commands       → eigene Befehle (JSON-Array)
 *   luma_quick_links    → Schnelllinks (JSON-Array)
 *   luma_theme          → 'dark' | 'light' (String)
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════
   KONSTANTEN & STATE
═══════════════════════════════════════════════════════════════════ */

const QL_KEY  = 'luma_quick_links';
const SET_KEY = 'luma_settings';
const CMD_KEY = 'luma_commands';

const DEFAULT_SETTINGS = {
    openNewTab:   false,
    region:       'de-DE',
    showFavicons: true,
    reduceMotion: false,
    localHistory: true,
    theme:        'dark'
};

let _isLoggedIn = false;

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */

function safeJson(str, fallback) {
    try { return JSON.parse(str); } catch { return fallback; }
}

function el(id) { return document.getElementById(id); }

/* ═══════════════════════════════════════════════════════════════════
   CLOUD SYNC
═══════════════════════════════════════════════════════════════════ */

async function cloudLoad() {
    try {
        const res  = await fetch('/api/user/preferences');
        const data = await res.json();
        return data.success ? data.preferences : null;
    } catch { return null; }
}

async function cloudSave(patch) {
    if (!_isLoggedIn) return;
    try {
        await fetch('/api/user/preferences', {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(patch)
        });
    } catch { /* silent – local is source of truth when offline */ }
}

/* ═══════════════════════════════════════════════════════════════════
   NAVIGATION (Scroll Spy)
═══════════════════════════════════════════════════════════════════ */

function initNavigation() {
    const navBtns  = document.querySelectorAll('.nav-item[data-target]');
    const sections = document.querySelectorAll('section[id], .section[id]');

    // Click → smooth scroll
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // IntersectionObserver for scroll spy
    if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    navBtns.forEach(b => b.classList.toggle('active', b.dataset.target === entry.target.id));
                }
            });
        }, { rootMargin: '-15% 0px -75% 0px' });

        sections.forEach(s => io.observe(s));
    } else {
        // Fallback: scroll-based
        window.addEventListener('scroll', () => {
            let current = sections[0]?.id ?? '';
            sections.forEach(s => {
                if (window.scrollY >= s.offsetTop - 160) current = s.id;
            });
            if (current) navBtns.forEach(b => b.classList.toggle('active', b.dataset.target === current));
        }, { passive: true });
    }
}

/* ═══════════════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════════════ */

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('luma_theme', theme);
    // Sync theme-pill in settings page
    document.querySelectorAll('.theme-opt').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
    });
}

function initTheme(savedTheme) {
    const theme = savedTheme || localStorage.getItem('luma_theme') || 'dark';
    applyTheme(theme);

    document.querySelectorAll('.theme-opt').forEach(btn => {
        btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });
}

/* ═══════════════════════════════════════════════════════════════════
   ALLGEMEINE EINSTELLUNGEN
═══════════════════════════════════════════════════════════════════ */

function initSettings(cloudPrefs) {
    const stored   = safeJson(localStorage.getItem(SET_KEY), {});
    let settings   = { ...DEFAULT_SETTINGS, ...stored };

    // Cloud ist master wenn eingeloggt
    if (cloudPrefs?.settings) {
        settings = { ...settings, ...cloudPrefs.settings };
        localStorage.setItem(SET_KEY, JSON.stringify(settings));
    }

    // Theme aus Settings anwenden
    if (settings.theme) initTheme(settings.theme);

    const BINDINGS = [
        { id: 'openNewTab',   key: 'openNewTab',   type: 'checkbox' },
        { id: 'regionSelect', key: 'region',       type: 'value'    },
        { id: 'showFavicons', key: 'showFavicons', type: 'checkbox' },
        { id: 'reduceMotion', key: 'reduceMotion', type: 'checkbox' },
        { id: 'localHistory', key: 'localHistory', type: 'checkbox' }
    ];

    BINDINGS.forEach(({ id, key, type }) => {
        const input = el(id);
        if (!input) return;

        // Wert setzen
        if (type === 'checkbox') input.checked = !!settings[key];
        else input.value = settings[key] ?? '';

        // Änderungen speichern
        input.addEventListener('change', () => {
            settings[key] = type === 'checkbox' ? input.checked : input.value;
            localStorage.setItem(SET_KEY, JSON.stringify(settings));
            cloudSave({ settings });

            // Seiteneffekte
            if (key === 'reduceMotion') {
                document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
            }
        });
    });

    // Theme-Buttons schreiben auch nach settings
    document.querySelectorAll('.theme-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            settings.theme = btn.dataset.theme;
            localStorage.setItem(SET_KEY, JSON.stringify(settings));
            cloudSave({ settings });
        });
    });

    // Daten löschen
    el('clearDataBtn')?.addEventListener('click', () => {
        const ok = confirm('Möchtest du wirklich alle lokalen Einstellungen und den Verlauf zurücksetzen?\n\nDieser Vorgang kann nicht rückgängig gemacht werden.');
        if (ok) { localStorage.clear(); location.reload(); }
    });
}

/* ═══════════════════════════════════════════════════════════════════
   EIGENE BEFEHLE
═══════════════════════════════════════════════════════════════════ */

function initCustomCommands(cloudPrefs) {
    const listEl    = el('customCommandsList');
    const addBtn    = el('addCmdBtn');
    const triggerIn = el('cmdTrigger');
    const urlIn     = el('cmdUrl');
    if (!listEl) return;

    let commands = safeJson(localStorage.getItem(CMD_KEY), []);
    if (cloudPrefs?.customCommands) {
        commands = cloudPrefs.customCommands;
        localStorage.setItem(CMD_KEY, JSON.stringify(commands));
    }

    function persist() {
        localStorage.setItem(CMD_KEY, JSON.stringify(commands));
        cloudSave({ customCommands: commands });
    }

    function render() {
        listEl.innerHTML = '';
        if (commands.length === 0) return;

        commands.forEach((cmd, i) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <span class="item-trigger">${escHtml(cmd.trigger)}</span>
                <span class="item-label">${escHtml(cmd.url)}</span>
                <button class="btn btn-red" style="padding:4px 10px;font-size:12px;">Löschen</button>
            `;
            div.querySelector('button').addEventListener('click', () => {
                commands.splice(i, 1);
                persist();
                render();
            });
            listEl.appendChild(div);
        });
    }

    // Global für autocomplete-Tester
    window.deleteCommand = (i) => { commands.splice(i, 1); persist(); render(); };

    addBtn?.addEventListener('click', () => {
        const trigger = triggerIn.value.trim();
        const url     = urlIn.value.trim();
        if (!trigger || !url) return;
        if (!trigger.startsWith('/')) {
            triggerIn.setCustomValidity('Das Kürzel muss mit / beginnen.');
            triggerIn.reportValidity();
            triggerIn.setCustomValidity('');
            triggerIn.focus();
            return;
        }
        commands.push({ trigger, url });
        persist();
        render();
        triggerIn.value = '';
        urlIn.value     = '';
        triggerIn.focus();
    });

    urlIn?.addEventListener('keypress', e => { if (e.key === 'Enter') addBtn?.click(); });
    render();
}

/* ═══════════════════════════════════════════════════════════════════
   SCHNELLLINKS
═══════════════════════════════════════════════════════════════════ */

function initQuicklinks(cloudPrefs) {
    const listEl  = el('qlSettingList');
    const emptyEl = el('qlSettingEmpty');
    const addBtn  = el('qlSettingAdd');
    if (!listEl) return;

    let links = safeJson(localStorage.getItem(QL_KEY), []);
    if (cloudPrefs?.quicklinks) {
        links = cloudPrefs.quicklinks;
        localStorage.setItem(QL_KEY, JSON.stringify(links));
    }

    function persist() {
        localStorage.setItem(QL_KEY, JSON.stringify(links));
        cloudSave({ quicklinks: links });
    }

    function render() {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = links.length === 0 ? 'block' : 'none';
        links.forEach((link, i) => {
            const div = document.createElement('div');
            div.className = 'item';
            div.innerHTML = `
                <span class="item-trigger">${escHtml(link.label)}</span>
                <span class="item-label">${escHtml(link.query)}</span>
                <button class="btn btn-red" style="padding:4px 10px;font-size:12px;">Entfernen</button>
            `;
            div.querySelector('button').addEventListener('click', () => {
                links.splice(i, 1);
                persist();
                render();
            });
            listEl.appendChild(div);
        });
    }

    addBtn?.addEventListener('click', () => {
        const label = el('qlSettingLabel').value.trim();
        const query = el('qlSettingQuery').value.trim();
        if (!label || !query) return;
        links.push({ label, query });
        persist();
        el('qlSettingLabel').value = '';
        el('qlSettingQuery').value = '';
        render();
    });

    el('qlSettingQuery')?.addEventListener('keypress', e => {
        if (e.key === 'Enter') addBtn?.click();
    });

    render();
}

/* ═══════════════════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════════════════ */

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════════════
   BOOTSTRAP
═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();

    // Theme sofort anwenden (vor Cloud-Load)
    initTheme();

    let cloudPrefs = null;
    try {
        const authRes  = await fetch('/api/auth/me');
        const authData = await authRes.json();
        if (authData.loggedIn) {
            _isLoggedIn = true;
            cloudPrefs  = await cloudLoad();
        }
    } catch { /* offline – weiter mit lokalem State */ }

    initSettings(cloudPrefs);
    initCustomCommands(cloudPrefs);
    initQuicklinks(cloudPrefs);
});