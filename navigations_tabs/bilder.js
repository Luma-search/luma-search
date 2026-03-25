export function renderBilder(data, container) {
    container.innerHTML = '';
    // Container Reset: Block statt Flex, damit Fixed Positioning sauberer arbeitet
    container.style.display = 'block';
    container.style.position = 'relative';
    container.style.margin = '0';
    container.style.paddingBottom = '15px';

    // Nur Items rendern, die tatsächlich eine Bild-URL haben
    const images = data.filter(item => item.image);

    if (!images.length) {
        container.style.display = 'block';
        container.innerHTML = '<p style="color: #bdc1c6;">Keine Bilder gefunden.</p>';
        return;
    }

    // 1. Das Bilder-Gitter (Linke Seite)
    const gridContainer = document.createElement('div');
    gridContainer.id = 'luma-images-grid'; // ID für Zugriff beim Schließen
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))'; // Etwas kleinere Kacheln für mehr Übersicht
    gridContainer.style.gap = '12px';
    gridContainer.style.marginRight = '0'; // Startet ohne Rand
    gridContainer.style.transition = 'margin-right 0.3s ease'; // Sanftes Zusammenschieben

    // 2. Das Detail-Panel (Rechte Seite - initial versteckt)
    const sidePanel = document.createElement('div');
    sidePanel.id = 'image-side-panel';
    // WICHTIG: Fixed statt Sticky, damit es immer im sichtbaren Bereich bleibt
    sidePanel.style.position = 'fixed';
    sidePanel.style.top = '130px';      // Abstand von oben (unterhalb Header/Tabs)
    sidePanel.style.right = '20px';     // Abstand von rechts
    sidePanel.style.bottom = '20px';    // Abstand von unten
    sidePanel.style.width = '450px';    // Feste Breite für das Panel
    sidePanel.style.maxWidth = '90vw';
    sidePanel.style.height = 'calc(100vh - 150px)'; // Höhe anpassen
    sidePanel.style.zIndex = '900';     // Über dem Inhalt schweben
    sidePanel.style.display = 'none';
    sidePanel.style.background = '#171717';
    sidePanel.style.border = '1px solid #3c4043';
    sidePanel.style.borderRadius = '12px';
    sidePanel.style.padding = '20px';
    sidePanel.style.flexDirection = 'column';
    sidePanel.style.overflowY = 'auto';

    // Hilfsfunktion zum Schließen
    window.closeImagePanel = () => {
        const p = document.getElementById('image-side-panel');
        const g = document.getElementById('luma-images-grid');
        if (p) p.style.display = 'none';
        if (g) g.style.marginRight = '0'; // Grid wieder breit machen
    };

    // Funktion zum Öffnen des Panels
    window.openImagePanel = (index, thumbElement) => {
        const item = images[index];
        if (!item) return;

        // Panel Inhalt bauen
        sidePanel.innerHTML = `
            <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
                <button onclick="window.closeImagePanel()" style="background:none; border:none; color:#9aa0a6; cursor:pointer; font-size:20px; padding:4px;">✕</button>
            </div>
            <div style="background:#000; display:flex; justify-content:center; align-items:center; border-radius:8px; overflow:hidden; margin-bottom:15px; min-height:200px;">
                <img src="${item.image}" style="max-width:100%; max-height:400px; object-fit:contain;" alt="${item.title}" onerror="this.src='data:image/svg+xml;base64,...'">
            </div>
            <a href="${item.url}" style="font-size:18px; color:#8ab4f8; text-decoration:none; display:block; margin-bottom:8px; line-height:1.4;">${item.title}</a>
            <div style="color:#bdc1c6; font-size:13px; margin-bottom:20px;">${new URL(item.url).hostname}</div>
            
            <a href="${item.url}" style="display:inline-block; background:#8ab4f8; color:#202124; padding:10px 24px; border-radius:20px; text-decoration:none; font-weight:500; font-size:14px; text-align:center; width:100%; box-sizing:border-box;">Webseite besuchen</a>
            
            <div style="margin-top:15px; padding-top:15px; border-top:1px solid #3c4043; display:flex; gap:10px;">
                <a href="${item.image}" style="flex:1; text-align:center; padding:8px; border:1px solid #5f6368; border-radius:18px; color:#e8eaed; text-decoration:none; font-size:13px;">Bild öffnen</a>
                <button onclick="navigator.clipboard.writeText('${item.image}')" style="flex:1; background:transparent; border:1px solid #5f6368; border-radius:18px; color:#e8eaed; cursor:pointer; font-size:13px; padding:8px;">Link kopieren</button>
            </div>
        `;

        // Anzeigen
        sidePanel.style.display = 'flex';
        
        // Grid zusammenschieben, um Platz zu machen (Google-Style)
        const grid = document.getElementById('luma-images-grid');
        if (grid && window.innerWidth > 900) {
            grid.style.marginRight = '470px'; // 450px Panel + 20px Abstand
        }
    };

    // Rendern der Thumbnails
    gridContainer.innerHTML = images.map((item, index) => `
        <div style="cursor: pointer; display: flex; flex-direction: column; overflow: hidden; border-radius: 12px; border: 1px solid #3c4043; background: #202124;"
             onclick="window.openImagePanel(${index}, this)">
            <div style="height: 180px; overflow: hidden; background: #303134; position: relative;">
                <img src="${item.image}" alt="${item.title}" 
                     style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s;" 
                     onerror="this.closest('div').parentElement.remove()"
                     onmouseover="this.style.transform='scale(1.05)'" 
                     onmouseout="this.style.transform='scale(1.0)'">
            </div>
            <div style="padding: 12px;">
                <div style="color: #e8eaed; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 4px;">
                    ${item.title}
                </div>
                <div style="color: #9aa0a6; font-size: 11px;">
                    ${new URL(item.url).hostname}
                </div>
            </div>
        </div>
    `).join('');

    container.appendChild(gridContainer);
    container.appendChild(sidePanel);
}