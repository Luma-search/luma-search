function _closeCtxOnOutside(e) {
    const menu = document.getElementById('result-ctx-menu');
    if (menu && !menu.contains(e.target)) menu.style.display = 'none';
}

// "Warum steht das hier oben?" im Kontext-Menü
document.getElementById('ctx-warum-btn')?.addEventListener('click', () => {
    document.getElementById('result-ctx-menu').style.display = 'none';
    if (typeof window.openWarumModal === 'function') {
        // _ctxBtn ist der result-more-btn der zuletzt geklickt wurde
        const fakeBtn = {
            dataset: {
                url:       _ctxUrl  || '',
                rankPos:   _ctxBtn?.dataset?.rankPos       || '?',
                trust:     _ctxBtn?.dataset?.trust         || '',
                relevance: _ctxBtn?.dataset?.relevance     || '',
                quality:   _ctxBtn?.dataset?.quality       || '',
                spam:      _ctxBtn?.dataset?.spam          || '',
                trend:     _ctxBtn?.dataset?.trend         || '0',
                approvalRating: _ctxBtn?.dataset?.approvalRating || null,
                totalVotes:     _ctxBtn?.dataset?.totalVotes     || '0',
                isTrending:     _ctxBtn?.dataset?.isTrending     || 'false',
            }
        };
        window.openWarumModal(fakeBtn, window._lumaLastResults || []);
    }
});

// "Trust Details" im Kontext-Menü
document.getElementById('ctx-trust-btn').addEventListener('click', () => {
    document.getElementById('result-ctx-menu').style.display = 'none';
    if (_ctxBtn && window.openTrustDetails) window.openTrustDetails(_ctxBtn.closest('.result-item')?.querySelector('.luma-rating-badge'));
    else openTrustModal();
});

// "Paywall melden" im Kontext-Menü
document.getElementById('ctx-paywall-btn').addEventListener('click', () => {
    document.getElementById('result-ctx-menu').style.display = 'none';
    openPaywallModal(_ctxUrl);
});

// "URL blockieren" im Kontext-Menü — speichert die komplette Domain, nicht nur die URL
document.getElementById('ctx-block-btn').addEventListener('click', async () => {
    document.getElementById('result-ctx-menu').style.display = 'none';

    // Domain normalisieren: www. entfernen, nur Hostname
    const domain = _ctxDomain.replace(/^www\./, '').toLowerCase().trim();
    if (!domain) return showLumaToast('Domain konnte nicht ermittelt werden.', 'error');

    try {
        // Auth prüfen
        const authRes  = await fetch('/api/auth/me');
        const authData = await authRes.json();

        if (!authData.loggedIn) {
            window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.href);
            return;
        }

        // Domain zur Blacklist hinzufügen
        const res  = await fetch('/api/blacklist', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ url: domain })
        });
        const data = await res.json();

        if (data.success) {
            // Alle Ergebnisse dieser Domain auf der Seite ausblenden
            document.querySelectorAll('.result-item').forEach(item => {
                const itemDomain = item.querySelector('.result-more-btn')?.getAttribute('data-domain') || '';
                const normalizedItemDomain = itemDomain.replace(/^www\./, '').toLowerCase();
                if (normalizedItemDomain === domain) {
                    item.style.transition   = 'opacity 0.35s';
                    item.style.opacity      = '0.15';
                    item.style.pointerEvents = 'none';
                    const existing = item.querySelector('.result-blocked-label');
                    if (!existing) {
                        const lbl = document.createElement('div');
                        lbl.className   = 'result-blocked-label';
                        lbl.textContent = '🚫 ' + domain + ' ist blockiert';
                        item.querySelector('.result-item-inner')?.appendChild(lbl);
                    }
                }
            });
            showLumaToast('🚫 ' + domain + ' gesperrt!', 'success');
        } else if (data.error && data.error.includes('bereits')) {
            showLumaToast(domain + ' ist bereits in deiner Blacklist.', '');
        } else {
            showLumaToast(data.error || 'Fehler beim Sperren.', 'error');
        }
    } catch {
        showLumaToast('Verbindungsfehler.', 'error');
    }
});

// ═══════════════════════════════════════════════════
// AUTH-AWARE HAMBURGER-DROPDOWN
// ═══════════════════════════════════════════════════
let _authChecked = false;