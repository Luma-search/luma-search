function showLumaToast(msg, type = '') {
    const el = document.getElementById('luma-toast');
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}
window.showLumaToast = showLumaToast;

// ── POGO-TRACKING ──────────────────────────────────────────────────────────
// Schritt 1: Beim Zurückkommen (back-button oder neue Suche) ausstehende
//            Verweilzeit aus localStorage senden.
(function sendPendingDwellTime() {
    try {
        const pending = localStorage.getItem('luma_klick_pending');
        if (!pending) return;
        localStorage.removeItem('luma_klick_pending');
        const { klickId, klickZeit } = JSON.parse(pending);
        if (!klickId) return;
        const verweilzeit_ms = Date.now() - klickZeit;
        navigator.sendBeacon('/api/verweilzeit', new Blob(
            [JSON.stringify({ klickId, verweilzeit_ms })],
            { type: 'application/json' }
        ));
    } catch(e) { /* nie blockieren */ }
})();

// Schritt 2: Beim Klick auf ein Ergebnis → Zeitstempel sofort speichern,
//            dann POST /api/klick → klickId nachträglich ergänzen.
window.lumaTrackClick = function(url, position) {
    try {
        const klickZeit = Date.now();
        const q         = new URLSearchParams(window.location.search).get('q') || '';
        let domain      = '';
        try { domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch(e) {}

        // Sofort speichern (noch ohne klickId – für session-basierte Fallback-Erkennung)
        localStorage.setItem('luma_klick_pending',
            JSON.stringify({ klickId: null, klickZeit }));

        // Async: klickId laden und ergänzen
        fetch('/api/klick', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url, domain, position: Number(position), suchanfrage: q }),
        })
        .then(r => r.json())
        .then(({ klickId }) => {
            if (klickId) {
                localStorage.setItem('luma_klick_pending',
                    JSON.stringify({ klickId, klickZeit }));
            }
        })
        .catch(() => {});
    } catch(e) { /* nie blockieren */ }
};

// Schritt 3: Falls der Nutzer auf demselben Tab zurückkommt (visibilitychange),
//            Verweilzeit sofort senden (genauerer Wert als beim nächsten Load).
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    try {
        const pending = localStorage.getItem('luma_klick_pending');
        if (!pending) return;
        localStorage.removeItem('luma_klick_pending');
        const { klickId, klickZeit } = JSON.parse(pending);
        if (!klickId) return;
        const verweilzeit_ms = Date.now() - klickZeit;
        navigator.sendBeacon('/api/verweilzeit', new Blob(
            [JSON.stringify({ klickId, verweilzeit_ms })],
            { type: 'application/json' }
        ));
    } catch(e) {}
});

// ═══════════════════════════════════════════════════
// KONTEXT-MENÜ (3-Punkte)
// ═══════════════════════════════════════════════════
let _ctxUrl = '', _ctxDomain = '', _ctxBtn = null;

window.openResultMenu = function(btn) {
    _ctxUrl    = btn.getAttribute('data-url') || '';
    _ctxDomain = btn.getAttribute('data-domain') || '';
    _ctxBtn    = btn;

    const menu = document.getElementById('result-ctx-menu');
    const rect = btn.getBoundingClientRect();

    // Position: unterhalb des Buttons, linksbündig, aber nie über den Rand
    let left = rect.left;
    if (left + 190 > window.innerWidth) left = window.innerWidth - 195;
    menu.style.left = left + 'px';
    menu.style.top  = (rect.bottom + 6) + 'px';
    menu.style.display = 'block';

    // Bei Klick außerhalb schließen
    setTimeout(() => {
        document.addEventListener('click', _closeCtxOnOutside, { once: true });
    }, 0);
};