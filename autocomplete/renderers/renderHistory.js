/**
 * Luma Autocomplete – Renderer: Suchverlauf
 * Rendert localStorage-Verlauf-Items in das Dropdown.
 * Neu: × Button zum Löschen einzelner Einträge.
 */

import { highlightQuery } from '../utils/highlight.js';
import { saveToHistory } from '../utils/history.js';

const SVG_CLOCK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
const SVG_CLOSE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

/**
 * @param {HTMLElement} container - Das Dropdown-Element
 * @param {string[]} historyItems - Gefilterte Verlaufseinträge
 * @param {string} query - Aktuelle Suchanfrage
 * @param {function(string): void} onSelect - Callback wenn ein Item gewählt wird
 * @param {function(string): void} [onRemove] - Callback wenn ein Eintrag gelöscht wird [NEU]
 */
export function renderHistory(container, historyItems, query, onSelect, onRemove) {
    if (!historyItems || historyItems.length === 0) return;

    historyItems.forEach(h => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item';
        div.setAttribute('role', 'option');
        const highlighted = highlightQuery(h, query);

        div.innerHTML = `
            <span class="autocomplete-icon" style="color:#888898;">${SVG_CLOCK}</span>
            <span class="autocomplete-text">${highlighted}</span>
            <input type="hidden" value="${h.replace(/"/g, '&quot;')}">
            <button class="ac-history-delete" title="Aus Verlauf entfernen" aria-label="Aus Verlauf entfernen" tabindex="-1">
                ${SVG_CLOSE}
            </button>
        `;

        // Haupt-Klick → auswählen
        div.addEventListener('click', function (e) {
            if (e.target.closest('.ac-history-delete')) return;
            const q = this.querySelector('input[type="hidden"]').value;
            saveToHistory(q);
            onSelect(q);
        });

        // × Button → nur löschen, nicht auswählen
        const deleteBtn = div.querySelector('.ac-history-delete');
        deleteBtn.addEventListener('mousedown', e => e.preventDefault()); // blur verhindern
        deleteBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (onRemove) onRemove(h);
            div.remove();
        });

        container.appendChild(div);
    });
}