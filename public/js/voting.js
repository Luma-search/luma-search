// ═══════════════════════════════════════════════════
// DIREKTES VOTING (ohne Modal)
// ═══════════════════════════════════════════════════

// Lokales Vote-Tracking — verhindert Doppelklick-Spam
// Speichert welche Domains der User in dieser Session schon bewertet hat
const _votedDomains = new Map(); // domain → 'positive'|'negative'|null

window.submitDirectVote = async function(type, domainOrUrl = null) {
    // Domain aus URL oder direkt
    let domain = domainOrUrl || _ctxDomain || '';
    try {
        if (domain.startsWith('http')) {
            domain = new URL(domain).hostname.replace(/^www\./, '');
        }
    } catch {}
    domain = domain.replace(/^www\./, '').toLowerCase().trim();
    if (!domain) return showLumaToast('Domain konnte nicht ermittelt werden.', 'error');

    // Doppelklick-Schutz: Button kurz deaktivieren
    const btn = event?.currentTarget || event?.target;
    if (btn) {
        if (btn._voting) return; // bereits am Abstimmen
        btn._voting = true;
        setTimeout(() => { btn._voting = false; }, 1500);
    }

    try {
        // Auth prüfen
        const authRes  = await fetch('/api/auth/me');
        const authData = await authRes.json();

        if (!authData.loggedIn) {
            showLumaToast('Bitte anmelden, um abzustimmen.', 'error');
            setTimeout(() => {
                window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.href);
            }, 800);
            return;
        }

        // Vote abschicken
        const res = await fetch('/api/votes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domain, type })
        });

        const data = await res.json();
        if (data.success) {
            const removed = data.action === 'removed';
            showLumaToast(removed ? 'Bewertung entfernt.' : 'Danke für dein Feedback!', 'success');

            // Lokales Tracking aktualisieren
            _votedDomains.set(domain, removed ? null : type);

            // UI aktualisieren — Vote-Buttons für diese Domain highlighten
            document.querySelectorAll('.vote-pill').forEach(pill => {
                const parentBtn = pill.closest('[data-url]') || pill.closest('.result-item');
                let btnDomain = '';
                try {
                    const urlAttr = parentBtn?.querySelector('[data-domain]')?.dataset?.domain
                        || parentBtn?.dataset?.domain || '';
                    btnDomain = urlAttr.replace(/^www\./, '').toLowerCase();
                } catch {}
                if (btnDomain !== domain) return;

                const isThisType = pill.title === (type === 'positive' ? 'Gefällt mir' : 'Gefällt mir nicht');
                if (removed) {
                    pill.style.background = 'transparent';
                    pill.style.color = '#888898';
                    pill.style.borderColor = 'transparent';
                } else if (isThisType) {
                    pill.style.background = type === 'positive' ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)';
                    pill.style.color      = type === 'positive' ? '#4caf50' : '#f44336';
                    pill.style.borderColor= type === 'positive' ? 'rgba(76,175,80,0.4)' : 'rgba(244,67,54,0.3)';
                } else {
                    pill.style.background = 'transparent';
                    pill.style.color = '#888898';
                    pill.style.borderColor = 'transparent';
                }
            });

        } else {
            showLumaToast(data.error || 'Fehler beim Abstimmen.', 'error');
        }

    } catch (e) {
        showLumaToast('Verbindungsfehler.', 'error');
    }
};