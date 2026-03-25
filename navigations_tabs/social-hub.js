// ─────────────────────────────────────────────────────────
//  social-hub.js  |  navigations_tabs/social-hub.js
//  Echtzeit Social Hub mit Socket.io
// ─────────────────────────────────────────────────────────

// ── Socket.io Verbindung ─────────────────────────────────
// socket.io.js wird automatisch vom Server bereitgestellt.
// Stelle sicher dass im HTML VOR diesem Script steht:
//   <script src="/socket.io/socket.io.js"></script>

const socket = io();

let _aktuellesThema  = null; // Thema des aktuell geöffneten Rooms
let _eigenerUsername = '';   // Wird aus dem Input gelesen beim Senden

// ══════════════════════════════════════════════════════════
//  HUB ÖFFNEN / SCHLIESSEN
// ══════════════════════════════════════════════════════════

function openHub(thema) {
    document.getElementById('hub-title').textContent = thema;
    document.body.classList.add('hub-open');

    // Nur joinen wenn sich das Thema geändert hat
    if (_aktuellesThema !== thema) {
        if (_aktuellesThema) {
            socket.emit('leave_hub');
        }
        _aktuellesThema = thema;
        socket.emit('join_hub', { thema });
    }
}

function closeHub() {
    document.body.classList.remove('hub-open');
    if (_aktuellesThema) {
        socket.emit('leave_hub');
        _aktuellesThema = null;
    }
}

// ══════════════════════════════════════════════════════════
//  NACHRICHTEN SENDEN
// ══════════════════════════════════════════════════════════

function send() {
    const eingabe    = document.getElementById('msgInput');
    const text       = eingabe?.value.trim();
    const nutzername = document.getElementById('hubNutzername')?.value.trim() || 'Anonym';

    if (!text || !_aktuellesThema) return;

    socket.emit('hub_nachricht', {
        thema:      _aktuellesThema,
        nutzername: nutzername,
        inhalt:     text,
    });

    eingabe.value = '';
}

// Enter-Taste im Nachrichtenfeld
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'msgInput') send();
});

// ══════════════════════════════════════════════════════════
//  SOCKET.IO EVENTS (Server → Client)
// ══════════════════════════════════════════════════════════

// Verlauf beim Beitreten eines Rooms empfangen
socket.on('hub_verlauf', (nachrichten) => {
    const chat = document.getElementById('chat');
    if (!chat) return;

    chat.innerHTML = '';

    if (nachrichten.length === 0) {
        const leer = document.createElement('div');
        leer.className = 'anon-msg';
        leer.innerHTML = `<div style="color:var(--muted); font-style:italic; font-size:0.85rem;">
            Noch keine Nachrichten – sei der Erste!
        </div>`;
        chat.appendChild(leer);
        return;
    }

    nachrichten.forEach(n => {
        chat.appendChild(_nachrichtBauen({
            id:          n.id,
            anzeigeName: `@${n.nutzername}`,
            text:        n.inhalt,
            zeit:        _zeitVorher(n.erstellt_am),
            geloest:     n.is_solution,
            eigen:       false,
        }));
    });

    chat.scrollTop = chat.scrollHeight;
});

// Neue Nachricht empfangen (Broadcast von Server, auch eigene)
socket.on('neue_nachricht', (n) => {
    const chat = document.getElementById('chat');
    if (!chat) return;

    // "Noch keine Nachrichten"-Platzhalter entfernen falls vorhanden
    const platzhalter = chat.querySelector('.hub-platzhalter');
    if (platzhalter) platzhalter.remove();

    chat.appendChild(_nachrichtBauen({
        id:          n.id,
        anzeigeName: `@${n.nutzername}`,
        text:        n.inhalt,
        zeit:        _zeitVorher(n.erstellt_am),
        geloest:     n.is_solution,
        eigen:       false,
    }));

    chat.scrollTop = chat.scrollHeight;
});

// Fehlermeldung vom Server empfangen
socket.on('hub_fehler', ({ nachricht }) => {
    const chat = document.getElementById('chat');
    if (!chat) return;

    const el = document.createElement('div');
    el.className = 'anon-msg';
    el.style.borderColor = '#f44336';
    el.innerHTML = `<div style="color:#f44336; font-size:0.8rem;">⚠ ${_esc(nachricht)}</div>`;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;

    // Fehlermeldung nach 5 Sekunden automatisch ausblenden
    setTimeout(() => el.remove(), 5000);
});

// Verbindungsstatus
socket.on('connect', () => {
    console.log('🔌 [HUB] Mit Server verbunden');
    // Falls Seite neu geladen wurde und Hub noch offen ist
    if (_aktuellesThema) {
        socket.emit('join_hub', { thema: _aktuellesThema });
    }
});

socket.on('disconnect', () => {
    console.log('🔌 [HUB] Verbindung getrennt – versuche erneut...');
});

// ══════════════════════════════════════════════════════════
//  NACHRICHTEN-DOM-BAUSTEIN
// ══════════════════════════════════════════════════════════

function _nachrichtBauen({ id, anzeigeName, text, zeit, geloest, eigen }) {
    const el = document.createElement('div');
    el.className = 'anon-msg';
    el.style.position = 'relative';
    el.dataset.nachrichtId = id || '';

    el.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div class="meta">
                <span class="id">${_esc(anzeigeName)}</span>
                <span>${_esc(zeit)}</span>
            </div>
            <div class="hub-menu-container" style="position:relative;">
                <button class="hub-menu-dots"
                    style="background:none;border:none;color:#9aa0a6;cursor:pointer;font-size:18px;padding:0 5px;"
                    aria-label="Optionen">⋯</button>
                <div class="hub-popup"
                    style="display:none;position:absolute;right:0;top:24px;background:#303134;
                           border:1px solid #5f6368;border-radius:6px;z-index:1000;
                           min-width:160px;padding:5px 0;">
                    <button class="hub-menu-item"
                        onclick="hubMelden(${id || 0}, 'spam')">
                        Spam melden
                    </button>
                    <button class="hub-menu-item"
                        onclick="hubMelden(${id || 0}, 'harassment')">
                        Belästigung melden
                    </button>
                    <button class="hub-menu-item"
                        onclick="hubMelden(${id || 0}, 'hate_speech')">
                        Hassrede melden
                    </button>
                    <button class="hub-menu-item"
                        onclick="hubNutzerBlockieren('${(anzeigeName || '').replace('@', '')}', ${id || 0})"
                        style="color:#f44336;border-top:1px solid #3c4043;margin-top:4px;padding-top:10px;">
                        Nutzer blockieren
                    </button>
                </div>
            </div>
        </div>
        <div>${_esc(text)}</div>
        ${!eigen ? `
        <button class="solve-btn${geloest ? ' solved' : ''}"
            onclick="loesungMarkieren(this, '${text.replace(/'/g, "&#39;")}', ${id || 'null'})">
            ${geloest ? '✔ Als Lösung markiert' : 'Als Lösung markieren'}
        </button>` : ''}
    `;

    return el;
}

// ══════════════════════════════════════════════════════════
//  LISTEN — API-Logik für Suchergebnisse
// ══════════════════════════════════════════════════════════

/**
 * Lädt Listen zum Suchbegriff und zeigt sie in #results-list an.
 */
async function loadLists(query) {
    const container = document.getElementById('results-list');
    if (!container || !query) return;

    container.innerHTML = `
        <div class="result-card" style="cursor:default;">
            <p style="color:var(--muted); font-size:0.85rem;">Lädt Listen…</p>
        </div>`;

    try {
        const res   = await fetch(
            `/api/community-lists?q=${encodeURIComponent(query)}&min_rating=0&limit=5`,
            { signal: AbortSignal.timeout(5000) }
        );
        const listen = res.ok ? await res.json() : [];

        container.innerHTML = '';

        // Zurück-Button
        const zurueck = document.createElement('button');
        zurueck.className = 'result-card';
        zurueck.style.cssText = 'width:100%;text-align:left;color:var(--muted);font-size:0.85rem;cursor:pointer;';
        zurueck.textContent = '← Zurück';
        zurueck.onclick = () => window.history.back();
        container.appendChild(zurueck);

        if (!listen.length) {
            const leer = document.createElement('div');
            leer.className = 'result-card';
            leer.style.cursor = 'default';
            leer.innerHTML = `<p style="color:var(--muted); font-size:0.85rem;">
                Noch keine Listen zu „${_esc(query)}".
            </p>`;
            container.appendChild(leer);
            return;
        }

        listen.forEach(liste => {
            const karte = document.createElement('div');
            karte.className = 'result-card';
            karte.innerHTML = `
                <h3>${_esc(liste.title || liste.name)}</h3>
                <p>von @${_esc(liste.username || liste.erstellt_von)}
                ${parseInt(liste.item_count) > 0
                    ? ` · <span style="color:var(--accent)">${liste.item_count} Einträge</span>`
                    : ''}
                </p>`;
            karte.addEventListener('click', () => {
                openHub(liste.title || liste.name);
                _listeInChatLaden(liste.id, liste.title || liste.name, query);
            });
            container.appendChild(karte);
        });

    } catch (fehler) {
        container.innerHTML = `
            <div class="result-card" style="cursor:default;">
                <p style="color:var(--muted); font-size:0.85rem;">Fehler beim Laden der Listen.</p>
            </div>`;
    }
}

// ── Listen-Detail im Hub-Chat anzeigen ──────────────────────────────────────

async function _listeInChatLaden(listeId, listenTitel, query) {
    const chat = document.getElementById('chat');
    chat.innerHTML = `<div class="anon-msg" style="cursor:default;">
        <p style="color:var(--muted); font-size:0.85rem;">Lädt Einträge…</p>
    </div>`;

    try {
        const res = await fetch(
            `/api/community-lists/${listeId}`,
            { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { list, items } = await res.json();
        _listeInChatRendern(chat, list, items, query);
    } catch {
        chat.innerHTML = `<div class="anon-msg">
            <p style="color:var(--muted);">Fehler beim Laden der Einträge.</p>
        </div>`;
    }
}

function _listeInChatRendern(chat, liste, eintraege, query) {
    chat.innerHTML = '';

    // Vorhandene Lösungen in Wissens-Box laden
    const wissensBox = document.getElementById('knowledge-list');
    if (wissensBox) {
        wissensBox.innerHTML = '';
        eintraege.filter(e => e.is_solution).forEach(e => {
            const li = document.createElement('li');
            li.dataset.eintragId = e.id;
            li.textContent = (e.inhalt || e.content).slice(0, 80);
            wissensBox.appendChild(li);
        });
    }

    // Beschreibung oben
    if (liste.beschreibung) {
        const beschr = document.createElement('div');
        beschr.className = 'anon-msg';
        beschr.style.borderColor = 'var(--accent)';
        beschr.innerHTML = `<div style="color:var(--muted);font-size:0.8rem;">${_esc(liste.beschreibung)}</div>`;
        chat.appendChild(beschr);
    }

    // Einträge als Chat-Nachrichten
    if (eintraege.length === 0) {
        const leer = document.createElement('div');
        leer.className = 'anon-msg';
        leer.innerHTML = `<div style="color:var(--muted);font-style:italic;">Noch keine Einträge – sei der Erste!</div>`;
        chat.appendChild(leer);
    } else {
        eintraege.forEach(eintrag => {
            chat.appendChild(_nachrichtBauen({
                id:          eintrag.id,
                anzeigeName: `@${eintrag.nutzername || eintrag.username}`,
                text:        eintrag.inhalt || eintrag.content,
                zeit:        _zeitVorher(eintrag.erstellt_am),
                geloest:     eintrag.is_solution === true,
                eigen:       false,
            }));
        });
    }

    chat.scrollTop = chat.scrollHeight;

    // Eintrag-Formular ersetzen
    const eingabeBereich = document.querySelector('.hub-input-area');
    if (eingabeBereich) {
        eingabeBereich.innerHTML = `
            <div style="margin-bottom:8px;display:flex;gap:8px;">
                <input id="neuer-eintrag-nutzer" type="text"
                    placeholder="Username (optional)"
                    style="flex:1;background:#303134;border:1px solid var(--border);
                           border-radius:8px;color:var(--text);font-size:0.85rem;
                           padding:10px;outline:none;font-family:'Inter',sans-serif;">
            </div>
            <div class="input-box">
                <input type="text" id="neuer-eintrag-inhalt"
                    placeholder="Eintrag hinzufügen…" maxlength="1000">
                <button class="send-btn" id="neuer-eintrag-senden">Senden</button>
            </div>
            <div id="neuer-eintrag-meldung" style="font-size:0.78rem;padding-top:6px;"></div>`;

        document.getElementById('neuer-eintrag-senden')
            .addEventListener('click', () => _eintragSenden(liste, eintraege, query, chat));
        document.getElementById('neuer-eintrag-inhalt')
            .addEventListener('keydown', e => {
                if (e.key === 'Enter') _eintragSenden(liste, eintraege, query, chat);
            });
    }
}

async function _eintragSenden(liste, eintraege, query, chat) {
    const inhalt     = document.getElementById('neuer-eintrag-inhalt')?.value.trim();
    const nutzername = document.getElementById('neuer-eintrag-nutzer')?.value.trim() || 'Anonym';
    const meldungEl  = document.getElementById('neuer-eintrag-meldung');
    const btn        = document.getElementById('neuer-eintrag-senden');

    if (!inhalt) {
        meldungEl.style.color = '#f44336';
        meldungEl.textContent = 'Beitrag ist erforderlich.';
        return;
    }

    btn.disabled    = true;
    btn.textContent = '…';

    try {
        const res  = await fetch(`/api/community-lists/${liste.id}/items`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ content: inhalt, username: nutzername }),
        });
        const daten = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(daten.error || `HTTP ${res.status}`);

        eintraege.push({
            inhalt,
            nutzername,
            erstellt_am: new Date().toISOString(),
        });
        liste.item_count = (parseInt(liste.item_count) || 0) + 1;
        _listeInChatRendern(chat, liste, eintraege, query);

    } catch (e) {
        meldungEl.style.color  = '#f44336';
        meldungEl.textContent  = `Fehler: ${e.message}`;
        btn.disabled           = false;
        btn.textContent        = 'Senden';
    }
}

// ══════════════════════════════════════════════════════════
//  LÖSUNG MARKIEREN
// ══════════════════════════════════════════════════════════

function loesungMarkieren(btn, text, eintragId) {
    const geloest = btn.classList.toggle('solved');
    btn.textContent = geloest ? '✔ Als Lösung markiert' : 'Als Lösung markieren';

    const wissensBox = document.getElementById('knowledge-list');
    if (!wissensBox) return;

    if (geloest) {
        const li = document.createElement('li');
        li.dataset.eintragId = eintragId;
        li.textContent = text.slice(0, 80) + (text.length > 80 ? '…' : '');
        wissensBox.appendChild(li);
    } else {
        wissensBox
            .querySelectorAll(`li[data-eintrag-id="${eintragId}"]`)
            .forEach(li => li.remove());
    }

    // In DB persistieren falls API vorhanden
    if (eintragId) {
        fetch(`/api/community-lists/items/${eintragId}/solution`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ is_solution: geloest }),
        }).catch(() => {});
    }
}

// Rückwärtskompatibilität mit altem toggleSolve / markSolution
function toggleSolve(btn, text) {
    loesungMarkieren(btn, text, null);
}

function markSolution(btn, text, itemId) {
    loesungMarkieren(btn, text, itemId);
}

// ══════════════════════════════════════════════════════════
//  NUTZER BLOCKIEREN
// ══════════════════════════════════════════════════════════

/**
 * Blockiert einen Nutzer über die API.
 * Nur für eingeloggte Nutzer — nicht eingeloggte sehen einen Hinweis.
 * Nach dem Blockieren wird die Nachricht sofort aus dem Chat entfernt.
 */
window.hubNutzerBlockieren = async (nutzername, nachrichtId) => {
    // Popups schließen
    document.querySelectorAll('.hub-popup').forEach(p => {
        p.style.display = 'none';
        const m = p.closest('.anon-msg');
        if (m) m.style.zIndex = '';
    });

    if (!nutzername || nutzername === 'Anonym') {
        alert('Anonyme Nutzer können nicht blockiert werden.');
        return;
    }

    if (!confirm(`Möchtest du @${nutzername} wirklich blockieren? Du siehst dann keine Nachrichten mehr von dieser Person.`)) {
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

        // Alle Nachrichten dieses Nutzers sofort aus dem Chat entfernen
        const chat = document.getElementById('chat');
        if (chat) {
            chat.querySelectorAll('.anon-msg').forEach(msg => {
                const idEl = msg.querySelector('.id');
                if (idEl && idEl.textContent.replace('@', '').toLowerCase() === nutzername.toLowerCase()) {
                    msg.style.transition = 'opacity 0.3s';
                    msg.style.opacity = '0';
                    setTimeout(() => msg.remove(), 300);
                }
            });
        }

        // Kurze Bestätigung
        const bestaetigung = document.createElement('div');
        bestaetigung.className = 'anon-msg';
        bestaetigung.style.borderColor = '#4caf50';
        bestaetigung.innerHTML = `<div style="color:#4caf50;font-size:0.8rem;">@${_esc(nutzername)} wurde blockiert.</div>`;
        if (chat) {
            chat.appendChild(bestaetigung);
            chat.scrollTop = chat.scrollHeight;
            setTimeout(() => bestaetigung.remove(), 3000);
        }

    } catch (e) {
        alert(`Fehler beim Blockieren: ${e.message}`);
    }
};

// ══════════════════════════════════════════════════════════
//  MELDEN
// ══════════════════════════════════════════════════════════

window.hubMelden = async (id, grund) => {
    try {
        await fetch('/api/community-reports', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                report_type: 'item',
                target_id:   id || 0,
                reason:      grund,
                description: `Social Hub Meldung (ID: ${id})`,
            }),
        });
        alert('Meldung wurde erfolgreich übermittelt.');
    } catch (e) {
        console.error('Meldung fehlgeschlagen:', e);
    }
    document.querySelectorAll('.hub-popup').forEach(p => {
        p.style.display = 'none';
        const msg = p.closest('.anon-msg');
        if (msg) msg.style.zIndex = '';
    });
};

// ══════════════════════════════════════════════════════════
//  MENÜ-TOGGLE (Drei-Punkte-Menü in Nachrichten)
// ══════════════════════════════════════════════════════════

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('hub-menu-dots')) {
        const popup = e.target.nextElementSibling;
        const msg   = e.target.closest('.anon-msg');
        if (!popup || !msg) return;

        const wirdGeoeffnet = popup.style.display === 'none';

        // Alle anderen Popups schließen
        document.querySelectorAll('.hub-popup').forEach(p => {
            p.style.display = 'none';
            const m = p.closest('.anon-msg');
            if (m) m.style.zIndex = '';
        });

        if (wirdGeoeffnet) {
            popup.style.display = 'block';
            msg.style.zIndex    = '100';
        }
    } else if (!e.target.closest('.hub-popup')) {
        document.querySelectorAll('.hub-popup').forEach(p => {
            p.style.display = 'none';
            const m = p.closest('.anon-msg');
            if (m) m.style.zIndex = '';
        });
    }
});

// ══════════════════════════════════════════════════════════
//  HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════

function _esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _zeitVorher(datumStr) {
    if (!datumStr) return '';
    const datum = new Date(datumStr);
    if (isNaN(datum.getTime())) return '';   // ungültiges Datum → leer statt "NaN Tagen"
    const diff = Date.now() - datum.getTime();
    if (diff < 0) return 'gerade eben';      // Uhrzeitversatz abfangen
    const min  = Math.floor(diff / 60_000);
    if (min < 1)  return 'gerade eben';
    if (min < 60) return `vor ${min} Min.`;
    const std = Math.floor(min / 60);
    if (std < 24) return `vor ${std} Std.`;
    return `vor ${Math.floor(std / 24)} Tagen`;
}