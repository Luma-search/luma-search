/**
 * News Widget
 * Pfad: navigations_tabs/widgets/news-widget.js
 * Zeigt Nachrichten-Box bei Suche nach "news" oder "nachrichten"
 * Rendert: Zusammenfassung, Fakten mit Labels, Nächste Schritte
 */

function escAttr(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── News Widget rendern ───────────────────────────────────────────────────────
export async function renderNewsWidget(query, normalData, recipeItems, newsItems) {
    const isNewsQuery = /nachrichten|news/i.test(query);
    if (!isNewsQuery) return '';

    // Eigener Fetch — unabhängig von normalData damit die 10 normalen Ergebnisse vollständig bleiben
    let newsItemsList = [];
    try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(query)}&tab=news&limit=4`);
        const json = await res.json();
        const data = json.results || [];
        newsItemsList = data
            .map((item, idx) => ({ ...item, _globalIdx: idx }))
            .filter(item => item.url && !item.isFact && item.image && item.image.length > 10 && !item.image.startsWith('data:'))
            .slice(0, 4);
    } catch (e) {
        return '';
    }

    if (newsItemsList.length === 0) return '';
    // newsItems Array für alles.js befüllen (damit result-list.js Duplikate ausschließen kann)
    newsItems.push(...newsItemsList);

    const formatAge = (dateStr) => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '';
            const diff = Date.now() - date.getTime();
            const h = Math.floor(diff / 3600000);
            if (h < 1)  return 'Vor wenigen Minuten';
            if (h < 24) return `Vor ${h} Std.`;
            const d = Math.floor(h / 24);
            if (d < 7)  return `Vor ${d} Tag${d > 1 ? 'en' : ''}`;
            // Ältere Artikel: echtes Datum anzeigen
            return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch { return ''; }
    };

    return `<div class="news-widget" style="margin-bottom:32px;border:1px solid #3c4043;border-radius:12px;overflow:hidden;background:#202124;">
        <div style="padding:16px 20px 10px;">
            <h2 style="font-size:18px;color:#e8eaed;margin:0;font-weight:500;">Nachrichten</h2>
        </div>
        ${newsItemsList.map((item, index) => {
            // Globaler Index = echter Index in normalData (beim Filtern mitgeführt)
            const globalIdx = item._globalIdx || 0;
            let hostname = '';
            try { hostname = new URL(item.url).hostname.replace('www.', ''); } catch {}
            const isLast = index === newsItemsList.length - 1;
            return `
            <div style="${!isLast ? 'border-bottom:1px solid #3c4043;' : ''}">
                <div style="display:flex;gap:16px;padding:16px 20px;align-items:flex-start;">
                    <a href="${item.url}" onclick="if(window.lumaTrackClick){lumaTrackClick(this.href,${globalIdx},'news-widget');}" style="flex-shrink:0;">
                        ${item.image
                            ? `<img src="${item.image}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;display:block;" alt="${escAttr(item.title)}" onerror="this.style.display='none'">`
                            : '<div style="width:80px;height:80px;border-radius:8px;background:#303134;"></div>'}
                    </a>
                    <div style="display:flex;flex-direction:column;justify-content:center;min-width:0;flex:1;">
                        <a href="${item.url}" onclick="if(window.lumaTrackClick){lumaTrackClick(this.href,${globalIdx},'news-widget');}" style="text-decoration:none;">
                            <div style="font-size:15px;font-weight:500;color:#8ab4f8;margin-bottom:6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;">${item.title}</div>
                        </a>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <div style="font-size:12px;color:#9aa0a6;display:flex;align-items:center;gap:6px;">
                                ${hostname ? `<img src="https://www.google.com/s2/favicons?sz=32&domain=${hostname}" style="width:12px;height:12px;border-radius:2px;">` : ''}
                                <span>${hostname}</span>
                                ${(item.date || item.veroeffentlicht_am || item.publishedDate) 
                                    ? `<span>&bull; ${formatAge(item.date || item.veroeffentlicht_am || item.publishedDate)}</span>` 
                                    : ''}
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}