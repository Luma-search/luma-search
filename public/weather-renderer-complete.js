/**
 * Luma Weather Box – Vollständig modernisiert mit Chart.js + 7-Tage Forecast
 */

let weatherChart = null;

async function renderWeatherBox(query) {
    try {
        const weatherContainer = document.getElementById('weather-container');
        weatherContainer.innerHTML = '';
        
        if (!isWeatherQuery(query)) {
            return;
        }
        
        const location = extractLocationFromQuery(query);
        if (!location) {
            console.log('[Weather] No location extracted');
            return;
        }
        
        const weatherData = await fetchWeather(location);
        
        if (!weatherData) {
            console.log('[Weather] No weather data returned');
            return;
        }
        
        const { 
            location: locName,
            admin1,
            temperature,
            weatherDescription,
            windSpeed,
            precipitation,
            humidity,
            weatherCode,
            forecast
        } = weatherData;
        
        function selectWeatherIcon(code) {
            if (code === 0 || code === 1) {
                return `<svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/></svg>`;
            }
            if (code >= 45 && code <= 48) {
                return `<svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.354 15.354H18c0-.734-.598-1.333-1.333-1.333-.734 0-1.333.599-1.333 1.333H8c-2.205 0-4-1.794-4-4s1.795-4 4-4c.595-2.045 2.458-3.541 4.667-3.541 2.676 0 4.856 2.116 4.99 4.804.018-.001.035-.004.053-.004 1.839 0 3.333 1.493 3.333 3.333 0 1.839-1.493 3.333-3.333 3.333l.644.408z"/></svg>`;
            }
            if (code >= 61 && code <= 82) {
                return `<svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M17.5 13c1.933 0 3.5-1.567 3.5-3.5S19.433 6 17.5 6c-1.734 0-3.176 1.273-3.44 2.92C13.156 8.334 12.14 8 11 8 8.791 8 7 9.791 7 12c0 .234.024.462.068.684C5.757 13.296 4.788 14.61 4.788 16.17c0 1.95 1.584 3.534 3.534 3.534h9.178v-.704z"/><path d="M11.5 18v2.5m3-2.5v2.5m-6 0v2.5"/></svg>`;
            }
            return `<svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.354 15.354H18c0-.734-.598-1.333-1.333-1.333-.734 0-1.333.599-1.333 1.333H8c-2.205 0-4-1.794-4-4s1.795-4 4-4c.595-2.045 2.458-3.541 4.667-3.541 2.676 0 4.856 2.116 4.99 4.804.018-.001.035-.004.053-.004 1.839 0 3.333 1.493 3.333 3.333 0 1.839-1.493 3.333-3.333 3.333l.644.408z"/></svg>`;
        }
        
        const iconHTML = selectWeatherIcon(weatherCode);
        const box = document.createElement('div');
        box.className = 'weather-box';
        
        // HEADER
        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        `;
        
        const headerLeft = document.createElement('div');
        headerLeft.style.cssText = 'flex: 1;';
        
        const locationDiv = document.createElement('div');
        locationDiv.style.cssText = 'font-size: 20px; font-weight: 700; margin-bottom: 4px;';
        locationDiv.textContent = locName;
        
        const regionDiv = document.createElement('div');
        regionDiv.style.cssText = 'font-size: 12px; opacity: 0.7; margin-bottom: 8px;';
        regionDiv.textContent = `${admin1 || 'Deutschland'} • Heute`;
        
        const dateDiv = document.createElement('div');
        dateDiv.style.cssText = 'font-size: 11px; opacity: 0.6;';
        const now = new Date();
        dateDiv.textContent = now.toLocaleDateString('de-DE', { weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        
        headerLeft.appendChild(locationDiv);
        headerLeft.appendChild(regionDiv);
        headerLeft.appendChild(dateDiv);
        
        const headerRight = document.createElement('div');
        headerRight.style.cssText = 'color: white;';
        headerRight.innerHTML = iconHTML;
        
        header.appendChild(headerLeft);
        header.appendChild(headerRight);
        box.appendChild(header);
        
        // CURRENT WEATHER
        const currentWeather = document.createElement('div');
        currentWeather.style.cssText = 'display: flex; align-items: flex-end; gap: 16px; margin-bottom: 24px;';
        
        const tempDisplay = document.createElement('div');
        tempDisplay.style.cssText = 'display: flex; align-items: baseline; gap: 8px;';
        
        const bigTemp = document.createElement('div');
        bigTemp.style.cssText = 'font-size: 64px; font-weight: 800; line-height: 1;';
        bigTemp.textContent = temperature + '°';
        
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size: 15px; font-weight: 500; max-width: 140px;';
        desc.textContent = weatherDescription;
        
        tempDisplay.appendChild(bigTemp);
        tempDisplay.appendChild(desc);
        currentWeather.appendChild(tempDisplay);
        
        const detailsRow = document.createElement('div');
        detailsRow.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;';
        
        detailsRow.appendChild(createSmallInfoCard(windSpeed + ' km/h', 'Wind'));
        detailsRow.appendChild(createSmallInfoCard(precipitation + ' mm', 'Niederschlag'));
        detailsRow.appendChild(createSmallInfoCard(humidity + ' %', 'Luftfeuchte'));
        
        currentWeather.appendChild(detailsRow);
        box.appendChild(currentWeather);
        
        // CHART SECTION
        if (forecast && forecast.length > 0) {
            const chartSection = document.createElement('div');
            chartSection.style.cssText = 'margin-bottom: 24px; padding: 16px; background: rgba(255,255,255,0.05); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);';
            
            const chartTitle = document.createElement('div');
            chartTitle.style.cssText = 'font-size: 12px; font-weight: 600; opacity: 0.7; margin-bottom: 12px; text-transform: uppercase;';
            chartTitle.textContent = 'Temperaturverlauf Nächste 7 Tage';
            
            const canvasContainer = document.createElement('div');
            canvasContainer.style.cssText = 'position: relative; height: 160px;';
            
            const canvas = document.createElement('canvas');
            canvas.style.cssText = 'width: 100%; height: 100%;';
            
            canvasContainer.appendChild(canvas);
            chartSection.appendChild(chartTitle);
            chartSection.appendChild(canvasContainer);
            box.appendChild(chartSection);
            
            const labels = forecast.map((f, i) => {
                const d = new Date(f.date);
                return d.toLocaleDateString('de-DE', { weekday: 'short' });
            });
            
            const maxTemps = forecast.map(f => f.tempMax);
            const minTemps = forecast.map(f => f.tempMin);
            
            const ctx = canvas.getContext('2d');
            weatherChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Max',
                            data: maxTemps,
                            borderColor: '#FF6B6B',
                            backgroundColor: 'rgba(255, 107, 107, 0.05)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: '#FF6B6B',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2
                        },
                        {
                            label: 'Min',
                            data: minTemps,
                            borderColor: '#4ECDC4',
                            backgroundColor: 'rgba(78, 205, 196, 0.05)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: '#4ECDC4',
                            pointBorderColor: '#fff',
                            pointBorderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            labels: {
                                color: 'rgba(255,255,255,0.7)',
                                font: { size: 11, weight: '600' },
                                padding: 12
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: 'rgba(255,255,255,0.2)',
                            borderWidth: 1,
                            padding: 8
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            border: { display: false },
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: {
                                color: 'rgba(255,255,255,0.6)',
                                font: { size: 11 },
                                callback: function(v) { return v + '°'; }
                            }
                        },
                        x: {
                            border: { display: false },
                            grid: { display: false },
                            ticks: {
                                color: 'rgba(255,255,255,0.6)',
                                font: { size: 11 }
                            }
                        }
                    }
                }
            });
        }
        
        // 7-DAY FORECAST
        if (forecast && forecast.length > 0) {
            const forecastSection = document.createElement('div');
            forecastSection.style.cssText = 'margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.1);';
            
            const forecastTitle = document.createElement('div');
            forecastTitle.style.cssText = 'font-size: 12px; font-weight: 600; opacity: 0.7; margin-bottom: 12px; text-transform: uppercase;';
            forecastTitle.textContent = '7-Tage Vorhersage';
            
            const forecastGrid = document.createElement('div');
            forecastGrid.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px;';
            
            forecast.forEach((day) => {
                const dayCard = document.createElement('div');
                dayCard.style.cssText = `
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 10px;
                    padding: 8px;
                    text-align: center;
                    transition: all 0.2s ease;
                    cursor: pointer;
                `;
                
                dayCard.onmouseenter = () => {
                    dayCard.style.background = 'rgba(255,255,255,0.12)';
                    dayCard.style.transform = 'translateY(-2px)';
                };
                dayCard.onmouseleave = () => {
                    dayCard.style.background = 'rgba(255,255,255,0.08)';
                    dayCard.style.transform = 'translateY(0)';
                };
                
                const d = new Date(day.date);
                const dayName = d.toLocaleDateString('de-DE', { weekday: 'short' });
                const dayNum = d.toLocaleDateString('de-DE', { day: 'numeric' });
                
                dayCard.innerHTML = `
                    <div style="font-size: 10px; opacity: 0.7; margin-bottom: 6px; font-weight: 600;">${dayName}</div>
                    <div style="font-size: 9px; opacity: 0.6; margin-bottom: 6px;">${dayNum}</div>
                    ${getWeatherIconSmall(day.weatherCode)}
                    <div style="font-size: 11px; font-weight: 600; margin: 6px 0;">${day.tempMax}°</div>
                    <div style="font-size: 9px; opacity: 0.7;">${day.tempMin}°</div>
                `;
                
                forecastGrid.appendChild(dayCard);
            });
            
            forecastSection.appendChild(forecastTitle);
            forecastSection.appendChild(forecastGrid);
            box.appendChild(forecastSection);
        }
        
        weatherContainer.appendChild(box);
        console.log('[Weather] Complete weather box rendered');
    } catch (err) {
        console.error('[Weather] renderWeatherBox error:', err);
    }
}

function createSmallInfoCard(value, label) {
    const card = document.createElement('div');
    card.style.cssText = `
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px;
        padding: 10px 8px;
        text-align: center;
        font-size: 11px;
    `;
    
    const valueDiv = document.createElement('div');
    valueDiv.style.cssText = 'font-weight: 700; font-size: 13px; margin-bottom: 3px;';
    valueDiv.textContent = value;
    
    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = 'opacity: 0.6; font-size: 10px;';
    labelDiv.textContent = label;
    
    card.appendChild(valueDiv);
    card.appendChild(labelDiv);
    return card;
}

function getWeatherIconSmall(code) {
    if (code === 0 || code === 1) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin: 4px auto; display: block;"><circle cx="12" cy="12" r="4"/><path d="M12 1v6m0 6v6" stroke="currentColor" stroke-width="1.5"/><path d="M4.22 4.22l4.24 4.24m4.24 4.24l4.24 4.24" stroke="currentColor" stroke-width="1.5"/><path d="M1 12h6m6 0h6" stroke="currentColor" stroke-width="1.5"/><path d="M4.22 19.78l4.24-4.24m4.24-4.24l4.24-4.24" stroke="currentColor" stroke-width="1.5"/></svg>';
    } else if (code >= 45 && code <= 48) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin: 4px auto; display: block;"><path d="M20.354 15.354H18c0-.734-.598-1.333-1.333-1.333-.734 0-1.333.599-1.333 1.333H8c-2.205 0-4-1.794-4-4s1.795-4 4-4c.595-2.045 2.458-3.541 4.667-3.541 2.676 0 4.856 2.116 4.99 4.804.018-.001.035-.004.053-.004 1.839 0 3.333 1.493 3.333 3.333 0 1.839-1.493 3.333-3.333 3.333l.644.408z"/></svg>';
    } else if (code >= 61 && code <= 82) {
        return '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin: 4px auto; display: block;"><path d="M17.5 13c1.933 0 3.5-1.567 3.5-3.5S19.433 6 17.5 6c-1.734 0-3.176 1.273-3.44 2.92C13.156 8.334 12.14 8 11 8 8.791 8 7 9.791 7 12c0 .234.024.462.068.684C5.757 13.296 4.788 14.61 4.788 16.17c0 1.95 1.584 3.534 3.534 3.534h9.178v-.704z"/></svg>';
    }
    return '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style="margin: 4px auto; display: block;"><path d="M20.354 15.354H18c0-.734-.598-1.333-1.333-1.333-.734 0-1.333.599-1.333 1.333H8c-2.205 0-4-1.794-4-4s1.795-4 4-4c.595-2.045 2.458-3.541 4.667-3.541 2.676 0 4.856 2.116 4.99 4.804.018-.001.035-.004.053-.004 1.839 0 3.333 1.493 3.333 3.333 0 1.839-1.493 3.333-3.333 3.333l.644.408z"/></svg>';
}
