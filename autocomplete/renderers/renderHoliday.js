/**
 * Luma Autocomplete – Renderer: Feiertag-Countdown
 * Zeigt den nächsten Feiertag mit Countdown-Information an
 */

export function renderHoliday(list, holiday, onClose) {
    if (!holiday) return;

    const item = document.createElement('div');
    item.className = 'autocomplete-item autocomplete-holiday';
    item.setAttribute('data-type', 'holiday');

    // Styling
    item.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        cursor: pointer;
        transition: background-color 0.2s ease;
        background-color: transparent;
    `;

    item.addEventListener('mouseenter', function () {
        this.style.backgroundColor = 'rgba(139,92,246,0.1)';
    });
    item.addEventListener('mouseleave', function () {
        this.style.backgroundColor = 'transparent';
    });

    // Icon
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size: 24px; flex-shrink: 0;';
    icon.textContent = holiday.icon || '📅';

    // Text-Container
    const textContainer = document.createElement('div');
    textContainer.style.cssText = 'flex: 1; min-width: 0;';

    // Title (Holiday Name)
    const title = document.createElement('div');
    title.style.cssText = `
        font-size: 14px;
        font-weight: 600;
        color: var(--text, #ededef);
        margin-bottom: 3px;
    `;
    title.textContent = holiday.name || 'Feiertag';

    // Output (Countdown + Datum)
    const output = document.createElement('div');
    output.style.cssText = `
        font-size: 13px;
        color: var(--muted, #888898);
        line-height: 1.4;
    `;
    
    // Formatiere das Output-Text mit etwas besserer Lesbarkeit
    const outputText = holiday.output || '';
    output.innerHTML = outputText
        .replace(/🐰|🎄|🎁|🕊️|📅|☁️|✝️|🥚|🇩🇪|✨|🛠️|🎆/g, '') // Icons entfernen (Icon ist oben)
        .trim();

    textContainer.appendChild(title);
    textContainer.appendChild(output);

    // Badge für Tage-Countdown
    const badge = document.createElement('div');
    badge.style.cssText = `
        flex-shrink: 0;
        background-color: rgba(139,92,246,0.2);
        border: 1px solid rgba(139,92,246,0.4);
        border-radius: 8px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 600;
        color: #8b5cf6;
        text-align: center;
        min-width: 50px;
    `;

    if (holiday.daysRemaining === 0) {
        badge.textContent = 'HEUTE';
        badge.style.backgroundColor = 'rgba(244,63,94,0.2)';
        badge.style.borderColor = 'rgba(244,63,94,0.4)';
        badge.style.color = '#f43f5e';
    } else if (holiday.daysRemaining === 1) {
        badge.textContent = 'MORGEN';
        badge.style.backgroundColor = 'rgba(34,197,94,0.2)';
        badge.style.borderColor = 'rgba(34,197,94,0.4)';
        badge.style.color = '#22c55e';
    } else {
        badge.textContent = `${holiday.daysRemaining}T`;
    }

    item.appendChild(icon);
    item.appendChild(textContainer);
    item.appendChild(badge);

    // Click Handler
    item.addEventListener('click', () => {
        if (onClose) onClose();
    });

    list.appendChild(item);
}
