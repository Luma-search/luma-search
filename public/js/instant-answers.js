/**
 * Instant Answers Renderer
 * Pfad: public/js/instant-answers.js
 * Rendert sofortige Antworten (Rechner, Wetter, Währung etc.)
 */
function renderInstantAnswers(answers) {
    const container = document.getElementById('instant-answers-container');
    if (!container) return;
    container.innerHTML = '';
    if (!answers || !answers.length) return;

    answers.forEach(ans => {
        let html = '';

        if (ans.type === 'support') {
            const phone = ans.phone || '';
            const telHref = `tel:${phone.replace(/\s/g, '')}`;
            html = `
                <div class="ia-card ia-card--support">
                    <div class="ia-card__icon">📞</div>
                    <div class="ia-card__body">
                        <div class="ia-card__label">Support & Kontakt</div>
                        <div class="ia-card__title">${ans.name}</div>
                        <div class="ia-card__sub">${ans.info}</div>
                        <div class="ia-card__sub" style="margin-top:2px;">🕐 ${ans.hours}</div>
                        <div>
                            <a class="ia-phone-btn" href="${telHref}">📞 ${phone}</a>
                            ${ans.website ? `<a class="ia-website" href="https://${ans.website}" target="_blank" rel="noopener">${ans.website}</a>` : ''}
                        </div>
                    </div>
                </div>`;

        } else if (ans.type === 'acronym') {
            html = `
                <div class="ia-card ia-card--acronym">
                    <div class="ia-card__icon">🔤</div>
                    <div class="ia-card__body">
                        <div class="ia-card__label">Abkürzung</div>
                        <div class="ia-short">${ans.short}</div>
                        <div class="ia-card__title" style="font-size:15px;margin-top:4px;">${ans.long}</div>
                        <div><span class="ia-badge">${ans.category}</span></div>
                        ${ans.description ? `<div class="ia-card__desc">${ans.description}</div>` : ''}
                    </div>
                </div>`;

        } else if (ans.type === 'weather') {
            const icon = ans.weatherCode <= 1 ? '☀️' : ans.weatherCode <= 3 ? '⛅' : ans.weatherCode < 60 ? '🌧️' : ans.weatherCode < 70 ? '🌧️' : ans.weatherCode < 80 ? '🌨️' : ans.weatherCode < 90 ? '🌦️' : '⛈️';
            const forecastHtml = (ans.forecast || []).slice(0, 5).map(f => {
                const d = new Date(f.date);
                const dayName = d.toLocaleDateString('de-DE', { weekday: 'short' });
                return `<div class="ia-forecast-day">
                    <div class="fd-date">${dayName}</div>
                    <div class="fd-temp">${f.tempMax}° / ${f.tempMin}°</div>
                    <div class="fd-desc">${(f.weatherDescription || '').substring(0, 8)}</div>
                </div>`;
            }).join('');
            html = `
                <div class="ia-card ia-card--weather">
                    <div class="ia-card__icon">${icon}</div>
                    <div class="ia-card__body">
                        <div class="ia-card__label">Wetter</div>
                        <div class="ia-card__title">${ans.location}${ans.admin1 ? ', ' + ans.admin1 : ''}</div>
                        <div class="ia-weather-temp">${ans.temperature}°C</div>
                        <div class="ia-weather-meta">
                            <span>☁️ ${ans.weatherDescription}</span>
                            <span>💧 ${ans.humidity}%</span>
                            <span>💨 ${ans.windSpeed} km/h</span>
                        </div>
                        ${forecastHtml ? `<div class="ia-forecast">${forecastHtml}</div>` : ''}
                    </div>
                </div>`;
        } else if (ans.type === 'watt') {
            const fmt = (v) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
            const wattLabel = ans.watt >= 1000
                ? (ans.watt / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' kW'
                : ans.watt.toLocaleString('de-DE') + ' W';

            const zeitZeile = ans.zeitStunden != null
                ? `<div class="ia-card__sub" style="margin-top:4px;">⏱️ Einmalig (${ans.zeitStunden.toLocaleString('de-DE', {maximumFractionDigits:2})} h): <strong>${fmt(ans.kosten_gesamt)}</strong> · ${ans.kwh_gesamt.toFixed(3).replace('.',',')} kWh</div>`
                : '';

            html = `
                <div class="ia-card ia-card--watt">
                    <div class="ia-card__icon">⚡</div>
                    <div class="ia-card__body">
                        <div class="ia-card__label">Stromkosten</div>
                        <div class="ia-card__title">${wattLabel} · ${fmt(ans.kosten_stunde)}/Std.</div>
                        ${zeitZeile}
                        <div class="ia-watt-grid">
                            <div class="ia-watt-cell"><div class="wc-label">Pro Stunde</div><div class="wc-value">${fmt(ans.kosten_stunde)}</div></div>
                            <div class="ia-watt-cell"><div class="wc-label">Pro Tag</div><div class="wc-value">${fmt(ans.kosten_tag)}</div></div>
                            <div class="ia-watt-cell"><div class="wc-label">Pro Monat</div><div class="wc-value">${fmt(ans.kosten_monat)}</div></div>
                            <div class="ia-watt-cell"><div class="wc-label">Pro Jahr</div><div class="wc-value">${fmt(ans.kosten_jahr)}</div></div>
                        </div>
                        <div class="ia-card__desc" style="margin-top:8px;">Basis: ${ans.preis.toFixed(2).replace('.',',')} €/kWh · Tagverbrauch bei 24h: ${(ans.kwh_stunde * 24).toFixed(2).replace('.',',')} kWh</div>
                    </div>
                </div>`;
        
        } else if (ans.type === 'numeral') {
            // Zahl-zu-Wort Konverter
            const copyToClipboard = (text) => {
                navigator.clipboard?.writeText(text);
                showLumaToast('Kopiert! ✓', 'success');
            };
            
            html = `
                <div class="ia-card ia-card--numeral">
                    <div class="ia-card__icon">🔢</div>
                    <div class="ia-card__body">
                        <div class="ia-card__label">Zahl in Worten</div>
                        <div style="display:flex; align-items:center; flex-wrap:wrap;">
                            <div class="ia-numeral-input">${ans.input}</div>
                            <div class="ia-numeral-arrow">→</div>
                        </div>
                        <div class="ia-numeral-output">
                            <strong>${ans.output}</strong>
                        </div>
                        ${ans.decimal ? `<div class="ia-numeral-decimal">📌 Dezimal: ${ans.decimal}</div>` : ''}
                        <div class="ia-numeral-buttons">
                            <button class="ia-numeral-btn" onclick="navigator.clipboard?.writeText('${ans.output}'); showLumaToast('Kopiert! ✓', 'success');">📋 Kopieren</button>
                            <button class="ia-numeral-btn" onclick="document.getElementById('searchInput').value='${ans.input}'; window.location.href='?q=' + encodeURIComponent('${ans.input}') + '&tab=all&page=1';">🔍 Neu suchen</button>
                        </div>
                    </div>
                </div>`;
        }

        if (html) container.insertAdjacentHTML('beforeend', html);
    });
}