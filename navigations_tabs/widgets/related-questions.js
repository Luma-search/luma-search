/**
 * Luma "Ähnliche Fragen" — DB-gestützt via /api/related-questions
 * Pfad: navigations_tabs/widgets/related-questions.js
 */

// Alle geladenen Fragen (für dynamisches Nachladen)
let _allQuestions = [];
let _renderedCount = 0;
const INITIAL_COUNT = 4;
const LOAD_MORE_COUNT = 2;

// ── Highlight ────────────────────────────────────────────────────────────────
function highlight(text, query) {
    if (!text || !query) return text || '';
    const terms = query.trim().split(/\s+/).filter(t => t.length > 2);
    if (!terms.length) return text;
    const pattern = `(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
    return text.replace(new RegExp(pattern, 'gi'), '<b style="color:#e8eaed;font-weight:500;">$1</b>');
}

// ── Einzelne Frage rendern ───────────────────────────────────────────────────
function renderItem(item, query) {
    let hostname = '';
    try { hostname = new URL(item.url).hostname.replace('www.', ''); } catch {}
    const favicon = hostname ? `https://www.google.com/s2/favicons?sz=32&domain=${hostname}` : '';

    // Generische "Was ist bekannt über:" Fragen verbessern
    let frage = item.frage || '';
    if (/^was ist bekannt über:/i.test(frage)) {
        frage = frage.replace(/^was ist bekannt über:\s*/i, '') + '?';
    }

    // Duplikat-Text entfernen (z.B. "OdinOdin" → "Odin")
    let antwort = (item.antwort || '').substring(0, 350);
    return `
        <details class="luma-paa-item">
            <summary>
                <span>${highlight(frage, query)}</span>
                <svg class="chevron" width="20" height="20" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </summary>
            <div class="luma-paa-answer">
                <p>${highlight(antwort + (item.antwort?.length > 350 ? '...' : ''), query)}</p>
                ${item.url ? `
                <a href="${item.url}" class="luma-paa-source" target="_blank">
                    <div class="luma-paa-source-meta">
                        ${favicon ? `<img src="${favicon}" alt="">` : ''}
                        <span>${hostname}</span>
                    </div>
                    <div class="luma-paa-source-title">${item.titel || ''}</div>
                </a>` : ''}
            </div>
        </details>`;
}

// ── HTML für Widget zurückgeben (wird von alles.js aufgerufen) ────────────────
export async function getRelatedQuestionsHtml(data, query) {
    if (!query) return '';

    try {
        const res = await fetch(`/api/related-questions?q=${encodeURIComponent(query)}&limit=20`);
        const questions = await res.json();

        if (!Array.isArray(questions) || questions.length === 0) {
            // Keine Daten → nichts anzeigen (kein Fallback mit Unsinn)
            return '';
        }

        // Deduplizieren
        const seen = new Set();
        const deduped = questions.filter(q => {
            const key = (q.frage || '').toLowerCase().trim().replace(/\s+/g, ' ').substring(0, 80);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        _allQuestions = deduped;
        _renderedCount = Math.min(INITIAL_COUNT, deduped.length);

        if (deduped.length === 0) return '';

        // Nur erste 4 anzeigen, Rest wird beim Aufklappen nachgeladen
        const initialHtml = deduped.slice(0, INITIAL_COUNT).map(q => renderItem(q, query)).join('');

        return `
        <div class="luma-paa-container" id="luma-paa-container">
            <h2 class="luma-paa-header">Ähnliche Fragen</h2>
            <div class="luma-paa-list" id="luma-paa-list">
                ${initialHtml}
            </div>
        </div>
        ${getPaaStyles()}`;

    } catch(e) {
        return ''; // Bei Fehler nichts anzeigen
    }
}

// ── Logik initialisieren (dynamisches Nachladen beim Aufklappen) ──────────────
export function initRelatedQuestionsLogic() {
    const list = document.getElementById('luma-paa-list');
    if (!list || list.dataset.initialized) return;
    list.dataset.initialized = 'true';

    // Beim Aufklappen einer Frage → 2 neue nachladen
    list.addEventListener('toggle', (e) => {
        if (e.target.tagName !== 'DETAILS' || !e.target.open) return;

        const query = new URLSearchParams(window.location.search).get('q') || '';

        if (_renderedCount < _allQuestions.length) {
            const next = _allQuestions.slice(_renderedCount, _renderedCount + LOAD_MORE_COUNT);
            _renderedCount += next.length;

            next.forEach(item => {
                const html = renderItem(item, query);
                const temp = document.createElement('div');
                temp.innerHTML = html;
                const el = temp.firstElementChild;
                el.style.opacity = '0';
                el.style.transition = 'opacity 0.35s ease';
                list.appendChild(el);
                requestAnimationFrame(() => { el.style.opacity = '1'; });
            });
        }
    }, true);
}

// ── Fallback: alte Methode aus Suchergebnissen ────────────────────────────────
function getFallbackHtml(data, query) {
    if (!data || data.length === 0) return '';

    const queryTerms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 2);

    const questions = data
        .filter(item => !item.isBestMatch && !item.isFact)
        .map(item => {
            const qText = item.structuredData?.faq?.[0]?.question || item.title || '';
            const aText = item.structuredData?.faq?.[0]?.answer || item.content || '';
            if (!queryTerms.some(t => qText.toLowerCase().includes(t))) return null;
            let score = 0;
            if (qText.includes('?')) score += 10;
            if (/^(was|wie|wer|warum|wo|wann|welche|kann|ist)\s/i.test(qText)) score += 20;
            if (score === 0) return null;
            return { frage: qText, antwort: aText, url: item.url, titel: item.title, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        // Duplikate entfernen
        .filter((item, idx, arr) => {
            const key = item.frage.toLowerCase().trim().replace(/\s+/g, ' ');
            return arr.findIndex(o => o.frage.toLowerCase().trim().replace(/\s+/g, ' ') === key) === idx;
        })
        .slice(0, 6);

    if (questions.length === 0) return '';

    _allQuestions = questions;
    _renderedCount = Math.min(INITIAL_COUNT, questions.length);

    return `
        <div class="luma-paa-container" id="luma-paa-container">
            <h2 class="luma-paa-header">Ähnliche Fragen</h2>
            <div class="luma-paa-list" id="luma-paa-list">
                ${questions.slice(0, _renderedCount).map(q => renderItem(q, query)).join('')}
            </div>
        </div>
        ${getPaaStyles()}`;
}

// ── CSS ──────────────────────────────────────────────────────────────────────
function getPaaStyles() {
    return `<style>
        .luma-paa-container { max-width: 652px; margin: 28px 0; width: 100%; background: transparent; font-family: arial, sans-serif; border-bottom: 1px solid #3c4043; }
        .luma-paa-header { font-size: 20px; color: #e8eaed; padding: 18px 20px 10px; margin: 0; font-weight: 400; }
        .luma-paa-list { width: 100%; }
        .luma-paa-item { border-top: 1px solid #3c4043; }
        .luma-paa-item summary { padding: 14px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; list-style: none; color: #bdc1c6; font-size: 16px; user-select: none; }
        .luma-paa-item summary::-webkit-details-marker { display: none; }
        .luma-paa-item summary:hover { background: rgba(255,255,255,0.04); }
        .luma-paa-item .chevron { color: #9aa0a6; transition: transform 0.2s; flex-shrink: 0; }
        .luma-paa-item[open] summary .chevron { transform: rotate(180deg); }
        .luma-paa-answer { padding: 0 20px 18px; color: #bdc1c6; font-size: 14px; line-height: 1.58; }
        .luma-paa-answer p { margin: 0 0 16px; word-wrap: break-word; }
        .luma-paa-source { display: block; text-decoration: none; border: 1px solid #3c4043; border-radius: 8px; padding: 12px; background: rgba(255,255,255,0.02); }
        .luma-paa-source:hover { background: rgba(255,255,255,0.06); }
        .luma-paa-source-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .luma-paa-source-meta img { width: 16px; height: 16px; border-radius: 2px; }
        .luma-paa-source-meta span { color: #9aa0a6; font-size: 12px; }
        .luma-paa-source-title { color: #8ab4f8; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    </style>`;
}