/**
 * LUMA TRUST BADGE MODUL
 * Generiert das Trust-Icon und das Detail-Popup für Suchergebnisse.
 */

export function getTrustBadgeHtml(item) {
    // Score: bevorzuge den vollen algorithmischen Trust-Score aus ranking.js,
    // Fallback auf domainTrust*100 nur wenn trustScore nicht vorhanden (z.B. Direktaufruf ohne Ranking)
    const score = item.trustScore !== undefined
        ? Math.round(item.trustScore)
        : Math.round((item.domainTrust || 0) * 100);
    
    // Farben definieren
    let color = '#f44336'; // Rot (Risiko)
    let label = 'Risiko';
    let icon = '🛡️';

    if (score >= 70) {
        color = '#4caf50'; // Grün (Trusted)
        label = 'Sicher';
    } else if (score >= 40) {
        color = '#ff9800'; // Orange (Neutral)
        label = 'Neutral';
    }

    // Daten für das Popup sicher als JSON-String im Attribut speichern
    const votes = item.votes || { approvalRating: null, totalVotes: 0 };
    const data = JSON.stringify({
        domain: new URL(item.url).hostname,
        score: score,
        secure: item.isSecure,
        age: item.domainAge || 0,
        eat: item.eatScore || 0,
        approvalRating: votes.approvalRating,
        totalVotes: votes.totalVotes,
        modifier: item.communityModifier || 0
    }).replace(/"/g, '&quot;');

    return `
        <span class="trust-badge" 
              style="cursor:pointer; display:inline-flex; align-items:center; gap:4px; margin-left:10px; background:${color}15; color:${color}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; border:1px solid ${color}40;"
              onclick="window.openTrustDetails(this)"
              data-trust="${data}"
              title="Klicken für Trust-Details">
            ${icon} ${score}% ${label}
        </span>
    `;
}

// Globale Funktion für das Popup (wird einmalig registriert)
if (typeof window !== 'undefined' && !window.openTrustDetails) {
    window.openTrustDetails = function(element) {
        const data = JSON.parse(element.getAttribute('data-trust'));
        
        // Parameter für das Popup vorbereiten
        const params = new URLSearchParams({
            domain: data.domain,
            score: data.score,
            secure: data.secure,
            eat: data.eat,
            age: data.age,
            modifier: data.modifier || 0,
            approvalRating: data.approvalRating !== null ? data.approvalRating : '',
            totalVotes: data.totalVotes || 0
        });

        // 1. Prüfen ob Modal schon existiert (Singleton)
        let modal = document.getElementById('luma-trust-detail-modal');

        if (!modal) {
            // 2. Modal Struktur exakt wie in results.html erstellen
            modal = document.createElement('div');
            modal.id = 'luma-trust-detail-modal';
            modal.className = 'modal-overlay'; // Nutzt CSS aus results.html
            
            // HTML einfügen (mit Inline-Style Override für Größe, da Popup kleiner als Dashboard sein soll)
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 500px; height: 700px;">
                    <button class="close-modal">×</button>
                    <iframe style="width:100%; height:100%; border:none;"></iframe>
                </div>
            `;
            
            document.body.appendChild(modal);

            // Event Listener für Schließen
            const closeBtn = modal.querySelector('.close-modal');
            const close = () => modal.classList.remove('open');
            
            closeBtn.onclick = close;
            modal.onclick = (e) => {
                if (e.target === modal) close();
            };
        }

        // 3. Iframe URL setzen und Modal öffnen
        const iframe = modal.querySelector('iframe');
        iframe.src = `/trust-popup.html?t=${Date.now()}&${params.toString()}`;
        
        // Klasse 'open' hinzufügen (wie in results.html definiert)
        // Kleiner Timeout damit CSS Transition greift falls neu erstellt
        setTimeout(() => modal.classList.add('open'), 10);
    };
}