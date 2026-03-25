/**
 * Luma Autocomplete – Renderer: Produkt-Karten
 */

import { highlightQuery, wordBoundaryRegex } from '../utils/highlight.js';
import { saveToHistory } from '../utils/history.js';

/**
 * @param {HTMLElement} container
 * @param {Array} productResults
 * @param {string} query
 * @param {function(string, string=): void} onSelect - (query, url?)
 */
export function renderProduct(container, productResults, query, onSelect) {
    if (!productResults || productResults.length === 0) return;

    // Wortgrenzen-Prüfung für Produkttitel (clientseitig)
    const termRegexes = query.toLowerCase().split(/\s+/)
        .filter(t => t.length > 2)
        .map(t => wordBoundaryRegex(t));

    productResults.forEach(p => {
        const productTitle = p.title || p.question || '';
        if (!productTitle) return;
        // Nur anzeigen wenn Query als ganzes Wort im Titel vorkommt
        if (termRegexes.length > 0 && !termRegexes.every(r => r.test(productTitle))) return;

        const div = document.createElement('div');
        div.className = 'autocomplete-item product-item';

        const titleHighlighted = highlightQuery(productTitle, query);
        const priceStr = p.price
            ? `${p.price}${p.currency ? ' ' + p.currency : ''}`
            : '';

        const imgHtml = p.image
            ? `<img class="product-image" src="${p.image}" alt="" loading="lazy" onerror="this.style.display='none'">`
            : (p.domain
                ? `<img class="product-image" src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(p.domain)}" alt="" loading="lazy" style="border-radius:4px;background:rgba(255,255,255,0.06);" onerror="this.style.display='none'">`
                : '');

        const descText = p.description || p.answer || '';
        const infoHtml = p.bullets && p.bullets.length > 0
            ? `<ul class="product-bullets">${p.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`
            : descText
                ? `<div class="product-desc">${descText}</div>`
                : '';

        div.innerHTML = `
            <div class="product-header">
                ${imgHtml}
                <span class="product-title-text">${titleHighlighted}</span>
                ${priceStr ? `<span class="product-price">${priceStr}</span>` : ''}
                <span class="autocomplete-badge product">SHOP</span>
            </div>
            ${infoHtml}
            <input type="hidden" value="${productTitle.replace(/"/g, '&quot;')}">
        `;
        div.dataset.productUrl = p.url || '';

        div.addEventListener('click', function () {
            const q = this.querySelector('input[type="hidden"]').value;
            saveToHistory(q);
            onSelect(q, this.dataset.productUrl || undefined);
        });

        container.appendChild(div);
    });
}
