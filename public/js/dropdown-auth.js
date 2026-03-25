async function loadDropdownAuth() {
    if (_authChecked) return;
    _authChecked = true;
    try {
        const res  = await fetch('/api/auth/me');
        const data = await res.json();
        const linksEl = document.getElementById('dropdown-auth-links');

        if (data.loggedIn) {
            linksEl.innerHTML = `
                <a class="dropdown-item" href="/my-blacklist.html">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                    Blacklist & Whitelist
                </a>
                <a class="dropdown-item" href="#" id="dd-logout-btn" title="${data.email}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Abmelden
                </a>`;
            document.getElementById('dd-logout-btn')?.addEventListener('click', async (e) => {
                e.preventDefault();
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.reload();
            });
        } else {
            linksEl.innerHTML = `
                <a class="dropdown-item" href="/login.html?redirect=${encodeURIComponent(window.location.href)}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    Anmelden
                </a>
                <a class="dropdown-item" href="/register.html">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                    Registrieren
                </a>`;
        }
    } catch { /* ignore */ }
}

// Auth laden wenn Hamburger geöffnet wird
document.getElementById('hamburgerBtn')?.addEventListener('click', loadDropdownAuth);