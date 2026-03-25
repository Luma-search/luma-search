/**
 * Luma Product Widget
 * Rendert High-End Rich Snippets für Produktseiten im kompakten Listen-Layout
 * Features: Hover-Effekte, Attribute, Farbpunkte, Wishlist-Button
 */

export function injectProductSnippetStyles() {
    const styleId = 'product-widget-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .product-widget-item {
            position: relative;
            transition: background 0.2s;
        }
        .product-widget-item:hover {
            background: rgba(255,255,255,0.03);
        }
        .product-brand-tag {
            font-size: 11px;
            color: #9aa0a6;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
        }
        .product-attr-pill {
            display: inline-block;
            font-size: 11px;
            color: #bdc1c6;
            background: rgba(255,255,255,0.06);
            padding: 2px 6px;
            border-radius: 4px;
            margin-right: 6px;
            margin-bottom: 4px;
        }
        .product-color-dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            border: 1px solid rgba(255,255,255,0.2);
            display: inline-block;
            margin-right: 4px;
        }
        .btn-quick-cart {
            background: rgba(138,180,248,0.1); 
            color: #8ab4f8;
            border: 1px solid rgba(138,180,248,0.3);
        }
        .btn-quick-cart:hover { background: rgba(138,180,248,0.2); }
    `;
    document.head.appendChild(style);
}

// Lokale Highlight-Funktion für das Widget
function highlightText(text, query) {
    if (!text || !query) return text;
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
    if (terms.length === 0) return text;
    const pattern = `(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
    const regex = new RegExp(pattern, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

// Hilfsfunktion: Attribute aus Text extrahieren
function extractAttributes(text) {
    const attrs = [];
    if (!text) return attrs;
    
    // Material
    if (/(baumwolle|cotton|wolle|seide|leder|polyester|leinen)/i.test(text)) {
        const match = text.match(/(\d+%?\s*)?(bio-)?(baumwolle|cotton|wolle|seide|leder|polyester|leinen)/i);
        if (match) attrs.push(match[0]);
    }
    // Fit
    if (/(regular|slim|oversized|loose|comfort)\s*fit/i.test(text)) {
        const match = text.match(/(regular|slim|oversized|loose|comfort)\s*fit/i);
        if (match) attrs.push(match[0]);
    }
    // Features
    if (/siebdruck|print|bestickt|logo/i.test(text)) attrs.push('Premium Print');
    if (/wasserdicht|atmungsaktiv/i.test(text)) attrs.push('Funktional');
    
    return attrs.slice(0, 3); // Max 3
}

// Hilfsfunktion: Farben erkennen für Swatches
function detectColors(text) {
    const colors = [];
    const map = {
        'schwarz': '#202124', 'black': '#202124',
        'weiß': '#f1f3f4', 'white': '#f1f3f4',
        'blau': '#1a73e8', 'blue': '#1a73e8', 'navy': '#0d47a1',
        'rot': '#ea4335', 'red': '#ea4335',
        'grau': '#9aa0a6', 'grey': '#9aa0a6', 'anthrazit': '#5f6368',
        'grün': '#34a853', 'green': '#34a853'
    };
    
    for (const [name, hex] of Object.entries(map)) {
        if (new RegExp(`\\b${name}\\b`, 'i').test(text)) {
            if (!colors.some(c => c.hex === hex)) colors.push({ name, hex });
        }
    }
    return colors.slice(0, 4);
}

export async function renderProductWidget(query) {
    if (!query) return '';

    let potentialProducts = [];
    try {
        // Eigene Suche für Produkte ausführen (unabhängig von Hauptliste)
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`);
        const json = await res.json();
        const data = json.results || [];

        potentialProducts = data
            .map((item, idx) => ({ ...item, _globalIdx: idx }))
            .filter(item =>
                (
                    item.category === 'ecommerce-shops' || 
                    item.category === 'shop' ||
                    (item.articleSection && /product|produkt|shop|e-commerce/i.test(item.articleSection))
                ) && 
                (item.price || (item.image && item.image.length > 10 && !item.image.startsWith('data:')))
            ).slice(0, 3);
    } catch (e) {
        return '';
    }

    if (potentialProducts.length === 0) return '';
    
    let html = `<div class="product-widget" style="margin-bottom:32px;border:1px solid #3c4043;border-radius:12px;overflow:hidden;background:#202124;">
        <div style="padding:16px 20px 10px;">
            <h2 style="font-size:18px;color:#e8eaed;margin:0;font-weight:500;">Produkte</h2>
            <div style="font-size:12px;color:#9aa0a6;margin-top:4px;">Die besten Angebote für "<b>${query}</b>"</div>
        </div>`;
    
    potentialProducts.forEach((item, index) => {
        const globalIdx = item._globalIdx || 0;
        const isLast = index === potentialProducts.length - 1;
        const price = item.price ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: item.currency || 'EUR' }).format(item.price) : '';
        const ratingValue = parseFloat(item.rating) || 0;
        const stars = ratingValue > 0 ? '★'.repeat(Math.round(ratingValue)) + '☆'.repeat(5 - Math.round(ratingValue)) : '';
        
        let hostname = '';
        try { hostname = new URL(item.url).hostname.replace(/^www\./, ''); } catch(e) {}
        const faviconUrl = hostname ? `https://www.google.com/s2/favicons?sz=16&domain=${hostname}` : '';
        
        // Metadaten extrahieren
        const brand = item.brand || (item.title.split(/[-:|]/)[0] || hostname).trim();
        const cleanTitle = item.brand && item.title.toLowerCase().startsWith(item.brand.toLowerCase()) 
            ? item.title.substring(item.brand.length).replace(/^[-:| ]+/, '') 
            : item.title;
        const attributes = extractAttributes(item.content);
        const colors = detectColors(item.title + ' ' + item.content);

        // Verfügbarkeit Farbe
        let availColor = '#9aa0a6'; // Grau default
        if (item.availability) {
            const lowerAvail = item.availability.toLowerCase();
            if (lowerAvail.includes('stock') || lowerAvail.includes('lager') || lowerAvail.includes('verfügbar')) availColor = '#81c995'; // Grün
            else if (lowerAvail.includes('sold') || lowerAvail.includes('ausverkauft')) availColor = '#f28b82';
        }

        html += `
        <div class="product-widget-item" style="${!isLast ? 'border-bottom:1px solid #3c4043;' : ''}">
            <div style="display:flex;gap:16px;padding:16px 20px;align-items:flex-start;">
                <a href="${item.url}" onclick="if(window.lumaTrackClick){lumaTrackClick(this.href,${globalIdx},'product-widget');}" style="flex-shrink:0;">
                    ${item.image 
                        ? `<img src="${item.image}" style="width:90px;height:90px;object-fit:contain;border-radius:8px;display:block;background:#fff;padding:4px;" alt="${item.title}" onerror="this.style.display='none'"/>`
                        : `<div style="width:90px;height:90px;border-radius:8px;background:#3c4043;"></div>`
                    }
                </a>
                <div style="display:flex;flex-direction:column;justify-content:center;min-width:0;flex:1;">
                    <div class="product-brand-tag">${brand}</div>
                    <a href="${item.url}" onclick="if(window.lumaTrackClick){lumaTrackClick(this.href,${globalIdx},'product-widget');}" style="text-decoration:none;">
                        <div style="font-size:16px;font-weight:500;color:#8ab4f8;margin-bottom:4px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;">
                            ${highlightText(cleanTitle, query)}
                        </div>
                    </a>
                    
                    <!-- Attributes & Colors -->
                    ${(attributes.length > 0 || colors.length > 0) ? `
                        <div style="margin-bottom:6px;">
                            ${attributes.map(a => `<span class="product-attr-pill">${a}</span>`).join('')}
                            ${colors.map(c => `<span class="product-color-dot" style="background:${c.hex}" title="${c.name}"></span>`).join('')}
                        </div>
                    ` : ''}

                    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:4px;">
                        <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:#9aa0a6;">
                            ${ratingValue > 0 ? `<div style="color:#fbbc04;">${stars} <span style="color:#9aa0a6;">(${item.ratingCount || ratingValue})</span></div>` : ''}
                            ${ratingValue > 0 && hostname ? `<span>&bull;</span>` : ''}
                        ${hostname ? `
                            <div style="display:flex;align-items:center;gap:4px;">
                                ${faviconUrl ? `<img src="${faviconUrl}" style="width:12px;height:12px;border-radius:2px;" alt="">` : ''}
                                <span>${hostname}</span>
                            </div>` : ''}
                        </div>

                        <div style="display:flex;align-items:center;gap:10px;">
                            ${price ? `<span style="font-size:16px;font-weight:700;color:#e8eaed;">${price}</span>` : ''}
                            <a href="${item.url}" onclick="if(window.lumaTrackClick){lumaTrackClick(this.href,${globalIdx},'product-widget');}" class="btn-quick-cart" style="font-size:11px;font-weight:600;padding:4px 10px;border-radius:100px;text-decoration:none;display:inline-block;">Zum Angebot ➔</a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    });
    
    html += `</div>`;
    return html;
}