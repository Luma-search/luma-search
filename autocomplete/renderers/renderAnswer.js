/**
 * Luma Autocomplete – Renderer: Prominente Antwort-Karte
 */

import { saveToHistory } from '../utils/history.js';

export function renderAnswer(container, answerResult, onSelect) {
    if (!answerResult || !answerResult.answer) return;

    const card = document.createElement('div');
    card.className = `ac-answer-card source-luma`;

    const thumbHtml = answerResult.thumbnail
        ? `<img class="ac-answer-thumb" src="${answerResult.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '';

    const answerText = answerResult.answer.length > 400
        ? answerResult.answer.substring(0, 400) + '…'
        : answerResult.answer;

    card.innerHTML = `
        <div class="ac-answer-top">
            ${thumbHtml}
            <div class="ac-answer-content">
                <div class="ac-answer-meta">
                    <span class="ac-answer-source-badge">Luma</span>
                    <span class="ac-answer-question">${answerResult.question}</span>
                </div>
                <div class="ac-answer-text">${answerText}</div>
                <div class="ac-answer-footer">
                    <button class="ac-answer-search-btn">Suche starten</button>
                </div>
            </div>
        </div>
    `;

    card.querySelector('.ac-answer-search-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        saveToHistory(answerResult.question);
        onSelect(answerResult.question);
    });

    container.appendChild(card);
}