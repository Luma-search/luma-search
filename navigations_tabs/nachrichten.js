export function renderNachrichten(data, container, query) {
    container.style.display = 'block';
    container.innerHTML = '';

    // Nur Nachrichten anzeigen, die ein Bild haben
    const news = data ? data.filter(item => item.image) : [];

    if (!news.length) {
        container.innerHTML = '<p style="color: #bdc1c6;">Keine Nachrichten gefunden.</p>';
        return;
    }

    // CSS für das neue Karten-Design
    const styles = `
        <style>
            .luma-news-item {
                display: flex;
                gap: 20px;
                padding: 16px;
                background: #202124;
                border: 1px solid #3c4043;
                border-radius: 12px;
                margin-bottom: 16px;
                text-decoration: none;
                transition: transform 0.2s, border-color 0.2s, background-color 0.2s;
            }
            .luma-news-item:hover {
                border-color: #5f6368;
                background: #303134;
                transform: translateY(-2px);
            }
            .luma-news-img-wrapper { width: 120px; height: 120px; flex-shrink: 0; }
            .luma-news-img { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; background: #303134; }
            .luma-news-content { display: flex; flex-direction: column; min-width: 0; }
            .luma-news-title {
                color: #8ab4f8; font-size: 18px; text-decoration: none; font-weight: 500;
                line-height: 1.4; margin-bottom: 6px; display: -webkit-box;
                -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            }
            .luma-news-meta { color: #9aa0a6; font-size: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
            .luma-news-meta img { width: 14px; height: 14px; border-radius: 2px; }
            .luma-news-snippet {
                color: #bdc1c6; font-size: 14px; line-height: 1.5; display: -webkit-box;
                -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            }
            .luma-news-snippet mark { background: none; font-weight: bold; color: #fdd835; padding: 0; }
        </style>
    `;

    const formatAge = (dateStr) => {
        if (!dateStr) return '';
        try {
            const diff = Date.now() - new Date(dateStr).getTime();
            const h = Math.floor(diff / 3600000);
            if (h < 1)  return 'Vor wenigen Minuten';
            if (h < 24) return `Vor ${h} Stunde${h === 1 ? '' : 'n'}`;
            const d = Math.floor(h / 24);
            if (d < 7)  return `Vor ${d} Tag${d === 1 ? '' : 'en'}`;
            return new Date(dateStr).toLocaleDateString('de-DE');
        } catch { return ''; }
    };

    const highlight = (text, q) => {
        if (!q || !text) return text || '';
        // Markiert jeden einzelnen Suchbegriff
        const terms = q.trim().split(/\s+/).filter(t => t.length > 1);
        if (terms.length === 0) return text;
        const regex = new RegExp(`(${terms.join('|')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    };

    const itemsHtml = news.map(item => {
        let hostname = '', favicon = '';
        try {
            const urlObj = new URL(item.url);
            hostname = urlObj.hostname.replace('www.', '');
            favicon = `https://www.google.com/s2/favicons?sz=32&domain=${hostname}`;
        } catch(e) {}

        return `
        <a href="${item.url}" class="luma-news-item">
             <div class="luma-news-img-wrapper">
                <img src="${item.image}" class="luma-news-img" alt="News" onerror="this.parentElement.style.display='none'">
             </div>
             <div class="luma-news-content">
                <div class="luma-news-title">${highlight(item.title, query)}</div>
                <div class="luma-news-meta">
                    ${favicon ? `<img src="${favicon}" alt="">` : ''}
                    <span>${hostname}</span>
                    ${item.publishedDate ? `<span>&bull; ${formatAge(item.publishedDate)}</span>` : ''}
                </div>
                <p class="luma-news-snippet">${highlight(item.content, query)}</p>
             </div>
        </a>
    `}).join('');

    container.innerHTML = styles + itemsHtml;
}