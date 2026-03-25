export function renderVideos(data, container, query) {
    container.innerHTML = '';
    container.style.display = 'block';
    container.style.position = 'relative';
    container.style.margin = '0';
    container.style.paddingBottom = '15px';

    // Nur Videos anzeigen, die ein Bild haben (serverseitige Filterung akzeptieren)
    const videos = data ? data.filter(item => item.image) : [];

    if (!videos.length) {
        container.style.display = 'block';
        container.innerHTML = '<p style="color: #bdc1c6;">Keine Videos gefunden.</p>';
        return;
    }

    // 1. Grid Container
    const gridContainer = document.createElement('div');
    gridContainer.id = 'luma-videos-grid';
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
    gridContainer.style.gap = '20px';
    gridContainer.style.marginRight = '0';
    gridContainer.style.transition = 'margin-right 0.3s ease';

    // 2. Side Panel
    const sidePanel = document.createElement('div');
    sidePanel.id = 'video-side-panel';
    sidePanel.style.position = 'fixed';
    sidePanel.style.top = '130px';
    sidePanel.style.right = '20px';
    sidePanel.style.bottom = '20px';
    sidePanel.style.width = '500px'; // Breiter für Videos
    sidePanel.style.maxWidth = '90vw';
    sidePanel.style.height = 'calc(100vh - 150px)';
    sidePanel.style.zIndex = '900';
    sidePanel.style.display = 'none';
    sidePanel.style.background = '#171717';
    sidePanel.style.border = '1px solid #3c4043';
    sidePanel.style.borderRadius = '12px';
    sidePanel.style.flexDirection = 'column';
    sidePanel.style.overflowY = 'auto';

    // Hilfsfunktion zum Schließen
    window.closeVideoPanel = () => {
        const p = document.getElementById('video-side-panel');
        const g = document.getElementById('luma-videos-grid');
        if (p) {
            p.style.display = 'none';
            p.innerHTML = ''; // WICHTIG: Stoppt die Video-Wiedergabe
        }
        if (g) g.style.marginRight = '0';
    };

    // Hilfsfunktion zum Extrahieren der YouTube ID
    const getYouTubeId = (url) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    // Funktion zum Öffnen des Panels
    window.openVideoPanel = (index) => {
        const item = videos[index];
        if (!item) return;

        // Eventuell offenes Bilder-Panel schließen
        window.closeImagePanel?.();

        let videoEmbedHtml = '';
        const youtubeId = getYouTubeId(item.url);

        if (youtubeId) {
            videoEmbedHtml = `<iframe width="100%" height="280" src="https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
            videoEmbedHtml = `<a href="${item.url}" style="display:block; position:relative;"><img src="${item.image}" style="width:100%; height:auto; max-height:280px; object-fit:cover; border-radius:8px;" alt="${item.title}"><div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 50px; height: 50px; background: rgba(0,0,0,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center;"><div style="width: 0; height: 0; border-left: 14px solid white; border-top: 10px solid transparent; border-bottom: 10px solid transparent; margin-left: 5px;"></div></div></a>`;
        }

        sidePanel.innerHTML = `
            <div style="padding: 20px;">
                <div style="display:flex; justify-content:flex-end; margin-bottom:15px;">
                    <button onclick="window.closeVideoPanel()" style="background:none; border:none; color:#9aa0a6; cursor:pointer; font-size:20px; padding:4px;">✕</button>
                </div>
                <div style="background:#000; border-radius:8px; overflow:hidden; margin-bottom:15px;">
                    ${videoEmbedHtml}
                </div>
                <a href="${item.url}" style="font-size:18px; color:#8ab4f8; text-decoration:none; display:block; margin-bottom:8px; line-height:1.4;">${item.title}</a>
                <div style="color:#bdc1c6; font-size:13px; margin-bottom:20px;">${new URL(item.url).hostname}</div>
                <a href="${item.url}" style="display:inline-block; background:#8ab4f8; color:#202124; padding:10px 24px; border-radius:20px; text-decoration:none; font-weight:500; font-size:14px; text-align:center; width:100%; box-sizing:border-box;">Webseite besuchen</a>
            </div>
        `;

        sidePanel.style.display = 'flex';
        
        const grid = document.getElementById('luma-videos-grid');
        if (grid && window.innerWidth > 900) {
            grid.style.marginRight = '520px'; // 500px Panel + 20px Abstand
        }
    };

    // Thumbnails rendern
    gridContainer.innerHTML = videos.map((item, index) => `
        <div style="background: #202124; border-radius: 12px; overflow: hidden; border: 1px solid #3c4043; cursor:pointer; transition: transform 0.2s, border-color 0.2s;"
             onclick="window.openVideoPanel(${index})"
             onmouseover="this.style.transform='translateY(-2px)'; this.style.borderColor='#5f6368';"
             onmouseout="this.style.transform='translateY(0)'; this.style.borderColor='#3c4043';">
            <div style="position: relative; height: 160px; background:#000;">
                <img src="${item.image}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;" onerror="this.closest('div[onclick]').remove()">
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 48px; height: 48px; background: rgba(0,0,0,0.6); border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 2px solid rgba(255,255,255,0.7);">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                </div>
                ${item.duration ? `<span style="position: absolute; bottom: 8px; right: 8px; background: rgba(0,0,0,0.8); color: white; font-size: 11px; font-weight: 500; padding: 2px 6px; border-radius: 4px;">${item.duration}</span>` : ''}
            </div>
            <div style="padding: 12px 14px;">
                <div style="color: #e8eaed; font-size: 14px; font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 5px; line-height: 1.4;">${item.title}</div>
                <div style="color: #9aa0a6; font-size: 12px;">${new URL(item.url).hostname}</div>
            </div>
        </div>
    `).join('');

    container.appendChild(gridContainer);
    container.appendChild(sidePanel);
}