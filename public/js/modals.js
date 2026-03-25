function goToHub() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) { 
        document.getElementById('searchInput').focus(); 
        return; 
    }
    window.location.href = `/social-hub.html?q=${encodeURIComponent(q)}`;
}

function openTrustModal() {
    document.getElementById('trustModal').classList.add('open');
    document.getElementById('settingsDropdown').classList.remove('open');
}
function closeTrustModal() {
    document.getElementById('trustModal').classList.remove('open');
}

function openPaywallModal(url) {
    const iframe = document.querySelector('#paywallModal iframe');
    if (url && typeof url === 'string') {
        iframe.src = '/paywall-radar.html?url=' + encodeURIComponent(url);
    } else {
        iframe.src = '/paywall-radar.html';
    }
    document.getElementById('paywallModal').classList.add('open');
    document.getElementById('settingsDropdown').classList.remove('open');
}
function closePaywallModal() {
    document.getElementById('paywallModal').classList.remove('open');
}

async function openCollectionsModal() {
    const modal = document.getElementById('collectionsModal');
    const iframe = modal.querySelector('iframe');

    // Workaround für X-Frame-Options: Inhalt per Fetch laden und injizieren
    if (!iframe.srcdoc) {
        try {
            const res = await fetch('/collection-manager.html');
            if (res.ok) {
                let html = await res.text();
                const base = `<base href="${window.location.origin}/" />`;
                html = html.replace('<head>', `<head>${base}`);
                // Styles injizieren: Header weg, Scrollbar unsichtbar machen
                html = html.replace('</head>', '<style>header, .back-link { display: none !important; } body { padding: 20px !important; } ::-webkit-scrollbar { display: none; } html { scrollbar-width: none; -ms-overflow-style: none; }</style></head>');
                iframe.srcdoc = html;
            }
        } catch (e) { console.error('Error loading collections:', e); }
    }

    modal.classList.add('open');
    document.getElementById('settingsDropdown').classList.remove('open');
}
function closeCollectionsModal() {
    document.getElementById('collectionsModal').classList.remove('open');
}