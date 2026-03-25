/**
 * Luma Autocomplete – Renderer: Stromkosten-Rechner
 */

const fmt = (v) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export function renderWatt(list, watt) {
    if (!watt || watt.type !== 'watt') return;

    const wattLabel = watt.watt >= 1000
        ? (watt.watt / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' kW'
        : watt.watt.toLocaleString('de-DE') + ' W';

    const item = document.createElement('div');
    item.className = 'autocomplete-item autocomplete-item--watt';
    item.innerHTML = `
        <span class="ac-watt-icon">⚡</span>
        <span class="ac-watt-body">
            <span class="ac-watt-title">${wattLabel} Stromkosten</span>
            <span class="ac-watt-grid">
                <span class="ac-watt-cell"><span class="ac-watt-lbl">Stunde</span><span class="ac-watt-val">${fmt(watt.kosten_stunde)}</span></span>
                <span class="ac-watt-cell"><span class="ac-watt-lbl">Tag</span><span class="ac-watt-val">${fmt(watt.kosten_tag)}</span></span>
                <span class="ac-watt-cell"><span class="ac-watt-lbl">Monat</span><span class="ac-watt-val">${fmt(watt.kosten_monat)}</span></span>
                <span class="ac-watt-cell"><span class="ac-watt-lbl">Jahr</span><span class="ac-watt-val">${fmt(watt.kosten_jahr)}</span></span>
            </span>
            <span class="ac-watt-footer">Basis: ${watt.preis.toFixed(2).replace('.', ',')} €/kWh</span>
        </span>`;
    list.appendChild(item);
}
