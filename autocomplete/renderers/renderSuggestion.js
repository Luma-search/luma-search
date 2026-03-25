/**
 * Luma Autocomplete – Renderer: Standard-Suchvorschläge
 * Rendert Calculator-, Converter-, Trends- und allgemeine Suchvorschläge.
 * Neu: ↗ Button zum Übernehmen in Suchfeld ohne sofortiger Suche.
 */

import { highlightQuery } from '../utils/highlight.js';
import { saveToHistory } from '../utils/history.js';

const SVG_SEARCH  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
const SVG_CALC    = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/></svg>`;
const SVG_CONVERT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/></svg>`;
const SVG_TREND   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 17"/><polyline points="17 6 23 6 23 12"/></svg>`;
// ↗ Pfeil: Begriff ins Suchfeld übernehmen ohne zu suchen [NEU]
const SVG_FILL    = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`;

/**
 * Baut das Icon-HTML für ein Suggestion-Item.
 * @param {{ type?: string, url?: string }} item
 * @returns {string} HTML-String
 */
function buildIcon(item) {
    if (item.type === 'calculator') {
        return `<span class="autocomplete-icon">${SVG_CALC}</span>`;
    }
    if (item.type === 'converter') {
        return `<span class="autocomplete-icon">${SVG_CONVERT}</span>`;
    }
    if (item.type === 'trend') {
        return `<span class="autocomplete-icon">${SVG_TREND}</span>`;
    }
    if (item.url) {
        let domain = '';
        try { domain = new URL(item.url).hostname; } catch (e) {}
        if (domain) {
            return `<span class="autocomplete-icon">` +
                `<img class="ac-favicon" src="https://www.google.com/s2/favicons?domain=${domain}&sz=32" alt=""` +
                ` onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` +
                `<span class="ac-favicon-fallback">${SVG_SEARCH}</span>` +
                `</span>`;
        }
    }
    return `<span class="autocomplete-icon">${SVG_SEARCH}</span>`;
}

/**
 * @param {HTMLElement} container
 * @param {Array<{ title: string, type?: string, score?: number, url?: string, trend_score?: number, frequency?: number }>} items
 * @param {string} query
 * @param {function(string): void} onSelect
 * @param {function(string): void} [onFill] - Übernimmt Begriff ins Suchfeld ohne Suche [NEU]
 */
export function renderSuggestion(container, items, query, onSelect, onFill) {
    if (!items || items.length === 0) return;

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.setAttribute('role', 'option');

        const icon  = buildIcon(item);
        const text  = highlightQuery(item.title, query);

        let badge = '';
        if (item.isHot || item.ist_trending) {
            // 🔥 Trending: Begriff wird gerade signifikant häufiger gesucht
            const label = item.trendLabel || '🔥 Trending';
            badge = `<span class="autocomplete-badge ac-badge-trending" title="${label}">${label}</span>`;
        } else if (item.trend_score > 5) {
            // 📈 Steigend: positiver Trend aber noch nicht viral
            badge = `<span class="autocomplete-badge ac-badge-rising" title="Steigt im Trend">📈</span>`;
        } else if (item.type && item.type !== 'general' && item.type !== 'keyword') {
            badge = `<span class="autocomplete-badge ${item.type}">${item.type.toUpperCase()}</span>`;
        }

        // ↗ Button: Begriff übernehmen ohne zu suchen [NEU]
        const fillBtn = onFill
            ? `<button class="ac-fill-btn" title="In Suchfeld übernehmen" aria-label="Begriff übernehmen" tabindex="-1">${SVG_FILL}</button>`
            : '';

        div.innerHTML = `
            ${icon}
            <span class="autocomplete-text">${text}</span>
            ${badge}
            <input type="hidden" value="${item.title.replace(/"/g, '&quot;')}">
            ${fillBtn}
        `;

        // Haupt-Klick → suchen
        div.addEventListener('click', function (e) {
            if (e.target.closest('.ac-fill-btn')) return;
            const q = this.querySelector('input[type="hidden"]').value;
            saveToHistory(q);
            onSelect(q);
        });

        // ↗ Klick → nur ins Suchfeld übernehmen [NEU]
        if (onFill) {
            const fillBtnEl = div.querySelector('.ac-fill-btn');
            fillBtnEl.addEventListener('mousedown', e => e.preventDefault());
            fillBtnEl.addEventListener('click', function (e) {
                e.stopPropagation();
                const q = div.querySelector('input[type="hidden"]').value;
                onFill(q);
            });
        }

        container.appendChild(div);
    });
}