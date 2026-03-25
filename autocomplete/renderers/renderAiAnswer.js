/**
 * Luma Autocomplete – Renderer: KI-Antwort-Items
 * Rendert KI-Antwort-Items (derzeit immer leer, aber bereit für zukünftige Aktivierung).
 */

import { highlightQuery } from '../utils/highlight.js';
import { saveToHistory } from '../utils/history.js';

/**
 * @param {HTMLElement} container
 * @param {Array<{ question: string, answer: string }>} aiResults
 * @param {string} query
 * @param {function(string): void} onSelect
 */
export function renderAiAnswer(container, aiResults, query, onSelect) {
    if (!aiResults || aiResults.length === 0) return;

    aiResults.forEach(ai => {
        const div = document.createElement('div');
        div.className = 'autocomplete-item ai-answer-item';

        const questionText = highlightQuery(ai.question || '', query);
        const answerText = (ai.answer || '').length > 160
            ? ai.answer.substring(0, 160) + '…'
            : (ai.answer || '');

        div.innerHTML = `
            <div class="autocomplete-ai-header">
                <span class="autocomplete-icon">🤖</span>
                <span class="autocomplete-ai-question">${questionText}</span>
                <span class="autocomplete-badge ai">KI</span>
            </div>
            <span class="autocomplete-ai-answer-text">${answerText}</span>
            <input type="hidden" value="${(ai.question || '').replace(/"/g, '&quot;')}">
        `;

        div.addEventListener('click', function () {
            const q = this.querySelector('input[type="hidden"]').value;
            saveToHistory(q);
            onSelect(q);
        });

        container.appendChild(div);
    });
}
