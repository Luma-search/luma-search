/**
 * Luma Autocomplete – Renderer: Verwandte Suchbegriffe
 * Rendert die Chip-Zeile mit verwandten Begriffen.
 */

import { saveToHistory } from '../utils/history.js';

/**
 * @param {HTMLElement} container
 * @param {string[]} relatedTerms
 * @param {function(string): void} onSelect
 */
export function renderRelated(container, relatedTerms, onSelect) {
    if (!relatedTerms || relatedTerms.length === 0) return;

    const row = document.createElement('div');
    row.className = 'ac-related-row';

    const label = document.createElement('span');
    label.className = 'ac-related-label';
    label.textContent = 'Meinten Sie auch:';
    row.appendChild(label);

    relatedTerms.forEach(term => {
        const chip = document.createElement('span');
        chip.className = 'ac-related-chip';
        chip.textContent = term;
        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            saveToHistory(term);
            onSelect(term);
        });
        row.appendChild(chip);
    });

    container.appendChild(row);
}
