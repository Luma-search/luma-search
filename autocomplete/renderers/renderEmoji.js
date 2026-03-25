/**
 * Luma Autocomplete – Renderer: Emoji-Suche + Picker-Panel
 *
 * Modus 1: results-Array → Emoji-Zeile mit klickbaren Emojis (max 8)
 * Modus 2: showPicker=true → Grid-Panel mit allen Emojis
 */

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    });
}

export function renderEmoji(list, emojiData, onClose) {
    if (!emojiData || emojiData.type !== 'emoji') return;

    // ── Modus 2: Picker-Panel ──────────────────────────────────────
    if (emojiData.showPicker) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ac-emoji-picker';

        const header = document.createElement('div');
        header.className = 'ac-emoji-picker__header';
        header.textContent = 'Emoji auswählen';
        wrapper.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'ac-emoji-picker__grid';

        (emojiData.results || []).forEach(({ emoji, keyword }) => {
            const btn = document.createElement('button');
            btn.className = 'ac-emoji-picker__btn';
            btn.title = keyword;
            btn.textContent = emoji;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                copyToClipboard(emoji);
                btn.classList.add('ac-emoji-picker__btn--copied');
                setTimeout(() => btn.classList.remove('ac-emoji-picker__btn--copied'), 800);
            });
            grid.appendChild(btn);
        });

        wrapper.appendChild(grid);
        list.appendChild(wrapper);
        return;
    }

    // ── Modus 1: Einzelzeile mit bis zu 8 Emojis ──────────────────
    if (!emojiData.results?.length) return;

    const row = document.createElement('div');
    row.className = 'autocomplete-item ac-emoji-row';

    const label = document.createElement('span');
    label.className = 'ac-emoji-row__label';
    label.textContent = 'Emoji:';
    row.appendChild(label);

    emojiData.results.forEach(({ emoji, keyword }) => {
        const btn = document.createElement('button');
        btn.className = 'ac-emoji-row__btn';
        btn.title = keyword;
        btn.textContent = emoji;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(emoji);
            btn.classList.add('ac-emoji-row__btn--copied');
            setTimeout(() => btn.classList.remove('ac-emoji-row__btn--copied'), 600);
        });
        row.appendChild(btn);
    });

    list.appendChild(row);
}
