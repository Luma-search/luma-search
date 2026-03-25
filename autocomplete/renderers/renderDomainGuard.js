/**
 * Luma Autocomplete – Renderer: Domain-Alters-Check
 */

const LEVEL_COLORS = {
    safe:    '#4ade80',
    warning: '#facc15',
    danger:  '#f87171',
    unknown: 'rgba(255,255,255,0.4)'
};

export function renderDomainGuard(list, domainGuard) {
    if (!domainGuard || domainGuard.type !== 'domain_guard') return;

    const color = LEVEL_COLORS[domainGuard.level] || LEVEL_COLORS.unknown;
    const ageText = domainGuard.ageInDays != null
        ? `${Math.floor(domainGuard.ageInDays / 365)} Jahr(e) alt`
        : 'Alter unbekannt';

    const item = document.createElement('div');
    item.className = 'autocomplete-item autocomplete-item--domain-guard';
    item.style.borderLeft = `3px solid ${color}`;
    item.innerHTML = `
        <span class="ac-dg-icon">🔍</span>
        <span class="ac-dg-body">
            <span class="ac-dg-domain">${domainGuard.domain}</span>
            <span class="ac-dg-age" style="color:${color}">${ageText}${domainGuard.created ? ' · Erstellt: ' + domainGuard.created : ''}</span>
            <span class="ac-dg-msg">${domainGuard.message}</span>
        </span>`;
    list.appendChild(item);
}
