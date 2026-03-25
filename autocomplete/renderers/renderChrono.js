/**
 * Luma Autocomplete – Renderer: Unix-Timestamp
 */

export function renderChrono(list, chrono) {
    if (!chrono || chrono.type !== 'timestamp') return;

    const item = document.createElement('div');
    item.className = 'autocomplete-item autocomplete-item--chrono';
    item.innerHTML = `
        <span class="ac-chrono-icon">📅</span>
        <span class="ac-chrono-body">
            <span class="ac-chrono-date">${chrono.title || chrono.raw}</span>
            <span class="ac-chrono-desc">${chrono.description}</span>
        </span>`;
    list.appendChild(item);
}
