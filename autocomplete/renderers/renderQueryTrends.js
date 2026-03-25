/**
 * Luma Autocomplete – Renderer: Query Trend Suggestions
 * Rendert die Frequency-based Suggestions mit Trend-Indikatoren
 */

/**
 * Rendert ein Query-Trend Suggestion Item
 * @param {Object} suggestion - { query, frequency, trend_score, relevanceScore, ... }
 * @returns {HTMLElement}
 */
export function renderQueryTrendSuggestion(suggestion) {
    const li = document.createElement('li');
    li.className = 'query-trend-suggestion autocomplete-item';
    li.setAttribute('role', 'option');

    // Container für Query + Icon
    const content = document.createElement('div');
    content.className = 'query-trend-content';

    // Haupt-Query Text
    const text = document.createElement('span');
    text.className = 'query-trend-text';
    text.textContent = suggestion.query;

    content.appendChild(text);

    // Trend-Indikator
    if (suggestion.trend_score !== null && suggestion.trend_score !== undefined) {
        const trendBadge = document.createElement('span');
        trendBadge.className = 'query-trend-badge';

        if (suggestion.trend_score > 10) {
            trendBadge.innerHTML = '📈 +' + suggestion.trend_score.toFixed(1) + '%';
            trendBadge.classList.add('trending-up');
        } else if (suggestion.trend_score < -10) {
            trendBadge.innerHTML = '📉 ' + suggestion.trend_score.toFixed(1) + '%';
            trendBadge.classList.add('trending-down');
        } else {
            trendBadge.textContent = '→ Stabil';
            trendBadge.classList.add('trending-stable');
        }

        content.appendChild(trendBadge);
    }

    // Frequency/Popularitäts-Info (optional)
    if (suggestion.frequency) {
        const freqInfo = document.createElement('span');
        freqInfo.className = 'query-trend-frequency';
        freqInfo.textContent = '⭐ ' + Math.round(suggestion.frequency * 10) / 10 + '%';
        content.appendChild(freqInfo);
    }

    li.appendChild(content);
    return li;
}

/**
 * Rendert eine Sektion mit trendenden Suchbegriffen
 * Wird angezeigt wenn der Input leer ist oder fokussiert wird
 * @param {HTMLElement} list - Das Container-Element
 * @param {Array<Object>} trends - Array von Trend-Objekten
 * @param {Function} onSelect - Callback wenn Item ausgewählt wird
 */
export function renderQueryTrends(list, trends, onSelect) {
    if (!trends || trends.length === 0) return;

    // Trends-Header
    const header = document.createElement('div');
    header.className = 'autocomplete-section-header';
    header.innerHTML = '🔥 <strong>Trending</strong>';
    list.appendChild(header);

    // Trends-Liste
    const ul = document.createElement('ul');
    ul.className = 'query-trends-list';

    trends.forEach(trend => {
        const item = renderQueryTrendSuggestion(trend);
        
        // Click-Handler
        item.addEventListener('click', () => {
            onSelect(trend.query || trend);
        });

        ul.appendChild(item);
    });

    list.appendChild(ul);
}
