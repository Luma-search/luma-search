export function renderFragen(data, container, query) {
    container.style.display = 'block';
    container.innerHTML = '';

    // Filtern: Nur Ergebnisse anzeigen, die Titel und Inhalt haben, um leere Einträge zu vermeiden.
    const questions = data ? data.filter(item => item.title && item.content) : [];

    if (questions.length === 0) {
        container.innerHTML = '<p style="color: #bdc1c6;">Keine Fragen gefunden.</p>';
        return;
    }

    // Styles für das Accordion-Design
    const style = `
        <style>
            .luma-faq-item {
                background: #202124;
                border: 1px solid #3c4043;
                border-radius: 8px;
                margin-bottom: 12px;
                overflow: hidden;
                transition: border-color 0.2s, background 0.2s;
            }
            .luma-faq-item:hover {
                border-color: #5f6368;
                background: #303134;
            }
            .luma-faq-item details > summary {
                list-style: none;
                padding: 16px 20px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                color: #e8eaed;
                font-size: 16px;
                font-weight: 500;
                user-select: none;
            }
            /* Standard-Dreieck ausblenden */
            .luma-faq-item details > summary::-webkit-details-marker {
                display: none;
            }
            .luma-faq-icon {
                color: #9aa0a6;
                transition: transform 0.3s ease;
                min-width: 24px;
            }
            /* Rotation bei geöffnetem Zustand */
            .luma-faq-item details[open] .luma-faq-icon {
                transform: rotate(180deg);
            }
            .luma-faq-content {
                padding: 0 20px 20px 20px;
                color: #bdc1c6;
                font-size: 14px;
                line-height: 1.6;
                border-top: 1px solid #3c4043;
            }
            .luma-faq-source {
                margin-top: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                color: #8ab4f8;
                text-decoration: none;
                background: rgba(138, 180, 248, 0.08);
                padding: 8px 12px;
                border-radius: 6px;
                width: fit-content;
            }
            .luma-faq-source:hover {
                background: rgba(138, 180, 248, 0.15);
            }
            .luma-faq-source img {
                width: 14px;
                height: 14px;
                border-radius: 2px;
            }
        </style>
    `;

    const itemsHtml = questions.map(item => {
        let hostname = '';
        let favicon = '';
        try {
            const urlObj = new URL(item.url);
            hostname = urlObj.hostname.replace('www.', '');
            favicon = `https://www.google.com/s2/favicons?sz=32&domain=${urlObj.hostname}`;
        } catch(e) {}

        return `
        <div class="luma-faq-item">
            <details>
                <summary>
                    <span>${item.title}</span>
                    <svg class="luma-faq-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </summary>
                <div class="luma-faq-content">
                    <div style="margin-top: 12px;">${item.content}</div>
                    ${item.url ? `
                        <a href="${item.url}" target="_blank" class="luma-faq-source">
                            ${favicon ? `<img src="${favicon}" alt="">` : ''}
                            Quelle: ${hostname}
                        </a>
                    ` : ''}
                </div>
            </details>
        </div>
        `;
    }).join('');

    container.innerHTML = style + itemsHtml;
}