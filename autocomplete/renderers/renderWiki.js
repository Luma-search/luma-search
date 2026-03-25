/**
 * Luma Autocomplete – Renderer: Wikipedia-Karte
 */

export function renderWiki(container, wikiResult, onClose) {
    if (!wikiResult || !wikiResult.title) return;

    const div = document.createElement('div');
    div.className = 'ac-wiki-item';

    const thumbHtml = wikiResult.thumbnail
        ? `<img class="ac-wiki-thumb" src="${wikiResult.thumbnail}" alt="" loading="lazy" onerror="this.style.display='none'">`
        : '';

    const extractShort = (wikiResult.extract || '').replace(/\n.*/s, '');

    div.innerHTML = `
        ${thumbHtml}
        <div class="ac-wiki-body">
            <div class="ac-wiki-header">
                <span class="ac-wiki-logo">Luma</span>
                <span class="ac-wiki-title">${wikiResult.title}</span>
            </div>
            <span class="ac-wiki-extract">${extractShort}</span>
        </div>
    `;

    container.appendChild(div);
}