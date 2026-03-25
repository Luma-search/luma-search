/**
 * Luma Autocomplete – Renderer: Weather-Box
 * Modernes, professionelles Wetter-Design
 */

const SVG_SUN = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;

const SVG_CLOUD = `<svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.354 15.354H18c0-.734-.598-1.333-1.333-1.333-.734 0-1.333.599-1.333 1.333H8c-2.205 0-4-1.794-4-4s1.795-4 4-4c.595-2.045 2.458-3.541 4.667-3.541 2.676 0 4.856 2.116 4.99 4.804.018-.001.035-.004.053-.004 1.839 0 3.333 1.493 3.333 3.333 0 1.839-1.493 3.333-3.333 3.333l.644.408z"/></svg>`;

const SVG_CLOUDRAIN = `<svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M17.5 13c1.933 0 3.5-1.567 3.5-3.5S19.433 6 17.5 6c-1.734 0-3.176 1.273-3.44 2.92C13.156 8.334 12.14 8 11 8 8.791 8 7 9.791 7 12c0 .234.024.462.068.684C5.757 13.296 4.788 14.61 4.788 16.17c0 1.95 1.584 3.534 3.534 3.534h9.178v-.704z"/><path d="M11.5 18v2.5m3-2.5v2.5m-6 0v2.5"/></svg>`;

const SVG_RAIN = `<svg width="56" height="56" viewBox="0 0 24 24" fill="currentColor" stroke="none"><g><path d="M12.75,6c2.625,0,4.875,1.852,5.4,4.425C19.8,10.575,21.75,12.675,21.75,15.225c0,2.7-2.175,4.875-4.875,4.875H9.375c-2.7,0-4.875-2.175-4.875-4.875c0-2.25,1.575-4.2,3.75-4.65C9.075,8.05,10.725,6,12.75,6z"/><path d="M10.5,18v2.25m3.75-2.25v2.25m-7.5,0v2.25"/></g></svg>`;

const SVG_WIND = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.667,9h-4.667c-1.1,0-2,-.9-2-2s.9-2,2-2h4.667L19.667,3l1.333,2l-1.333,2c0,0-4.667,0-4.667,0c-1.1,0-2,.9-2,2s.9,2,2,2h4.667L19.667,11l1.333,-2L19.667,9z"/><path d="M15,13h-10.667c-1.1,0-2,-.9-2-2s.9-2,2-2h10.667l-1,-2l1.333,2l-1.333,2c0,0,10.667,0,10.667,0c1.1,0,2,.9,2,2s-.9,2-2,2h-10.667l1,2l-1.333,-2l1.333,-2z"/><path d="M9.333,17h-4.667c-1.1,0-2,-.9-2-2s.9-2,2-2h4.667l-1,-2l1.333,2l-1.333,2c0,0,4.667,0,4.667,0c1.1,0,2,.9,2,2s-.9,2-2,2h-4.667l1,2l-1.333,-2l1.333,-2z"/></svg>`;

const SVG_HUMIDITY = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 3.5c0 0-8.5 10-8.5 15c0 4.694 3.806 8.5 8.5 8.5s8.5-3.806 8.5-8.5C20.5 13.5 12 3.5 12 3.5z"/></svg>`;

/**
 * Rendert die Wetter-Box im Autocomplete Dropdown
 * Modernes, professionelles Design
 * 
 * @param {HTMLElement} container - Das Dropdown-Element
 * @param {object} weatherData - Wetterdaten von der API
 * @param {function(): void} onClose - Callback zum Schließen des Panels
 */
export function renderWeather(container, weatherData, onClose) {
    if (!weatherData) return;
    
    const { 
        location, 
        admin1,
        temperature, 
        weatherDescription, 
        windSpeed, 
        precipitation,
        humidity,
        cloudCover,
        weatherCode
    } = weatherData;
    
    // Wähle Icon basierend auf Wetter-Code
    function selectWeatherIcon(code) {
        if (code === 0 || code === 1) return SVG_SUN;
        if (code >= 45 && code <= 48) return SVG_CLOUD;
        if (code >= 61 && code <= 82) return SVG_CLOUDRAIN;
        return SVG_CLOUD;
    }
    
    const weatherIcon = selectWeatherIcon(weatherCode);
    
    // Hauptcontainer: moderne Card mit Glas-Morphismus
    const weatherBox = document.createElement('div');
    weatherBox.className = 'autocomplete-weather-box';
    weatherBox.style.cssText = `
        margin: 0 8px 8px 8px;
        background: linear-gradient(135deg, rgba(71, 193, 179, 0.95) 0%, rgba(34, 139, 177, 0.95) 100%);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        padding: 20px;
        color: white;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 8px 32px rgba(71, 193, 179, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3);
        position: relative;
        overflow: hidden;
    `;
    
    // Gradient-Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: absolute;
        top: -50%;
        right: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
        pointer-events: none;
    `;
    weatherBox.appendChild(overlay);
    
    // Hover-Effekt
    weatherBox.addEventListener('mouseenter', () => {
        weatherBox.style.transform = 'translateY(-4px) scale(1.01)';
        weatherBox.style.boxShadow = '0 16px 48px rgba(71, 193, 179, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
    });
    
    weatherBox.addEventListener('mouseleave', () => {
        weatherBox.style.transform = 'translateY(0) scale(1)';
        weatherBox.style.boxShadow = '0 8px 32px rgba(71, 193, 179, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
    });
    
    // Header mit Location
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 16px;
        position: relative;
        z-index: 1;
    `;
    
    const locationSection = document.createElement('div');
    locationSection.style.cssText = 'flex: 1;';
    
    const locationText = document.createElement('div');
    locationText.style.cssText = `
        font-weight: 700;
        font-size: 17px;
        letter-spacing: 0.3px;
        margin-bottom: 3px;
    `;
    locationText.textContent = location;
    
    const regionText = document.createElement('div');
    regionText.style.cssText = `
        font-size: 12px;
        opacity: 0.85;
        font-weight: 500;
    `;
    regionText.textContent = admin1 || 'Deutschland';
    
    locationSection.appendChild(locationText);
    locationSection.appendChild(regionText);
    
    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = `
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.15));
    `;
    iconContainer.innerHTML = weatherIcon;
    iconContainer.style.color = 'white';
    
    header.appendChild(locationSection);
    header.appendChild(iconContainer);
    weatherBox.appendChild(header);
    
    // Main: Temperatur + Beschreibung
    const mainSection = document.createElement('div');
    mainSection.style.cssText = `
        display: flex;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 18px;
        position: relative;
        z-index: 1;
    `;
    
    const tempValue = document.createElement('div');
    tempValue.style.cssText = `
        font-size: 48px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -1px;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    `;
    tempValue.textContent = `${temperature}°`;
    
    const weatherDesc = document.createElement('div');
    weatherDesc.style.cssText = `
        font-size: 16px;
        font-weight: 500;
        opacity: 0.95;
        max-width: 140px;
    `;
    weatherDesc.textContent = weatherDescription;
    
    mainSection.appendChild(tempValue);
    mainSection.appendChild(weatherDesc);
    weatherBox.appendChild(mainSection);
    
    // Details Grid: Wind, Regen, Luftfeuchtigkeit
    const detailsGrid = document.createElement('div');
    detailsGrid.style.cssText = `
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
        position: relative;
        z-index: 1;
    `;
    
    // Wind Detail
    const windDetail = createDetailBox(
        SVG_WIND,
        `${windSpeed}`,
        'km/h',
        'Wind'
    );
    
    // Regen Detail
    const rainDetail = createDetailBox(
        SVG_RAIN,
        `${precipitation}`,
        'mm',
        'Regen'
    );
    
    // Luftfeuchtigkeit Detail
    const humidityDetail = createDetailBox(
        SVG_HUMIDITY,
        `${humidity}`,
        '%',
        'LF'
    );
    
    detailsGrid.appendChild(windDetail);
    detailsGrid.appendChild(rainDetail);
    detailsGrid.appendChild(humidityDetail);
    weatherBox.appendChild(detailsGrid);
    
    // Event Listener
    weatherBox.addEventListener('click', function() {
        onClose();
    });
    
    // In Container einfügen
    container.appendChild(weatherBox);
}

/**
 * Erstellt ein Detail-Box Element
 */
function createDetailBox(icon, value, unit, label) {
    const box = document.createElement('div');
    box.style.cssText = `
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.15);
        border: 1px solid rgba(255, 255, 255, 0.25);
        border-radius: 12px;
        padding: 12px 8px;
        backdrop-filter: blur(10px);
        transition: all 0.2s ease;
    `;
    
    box.addEventListener('mouseenter', () => {
        box.style.background = 'rgba(255, 255, 255, 0.2)';
        box.style.transform = 'translateY(-2px)';
    });
    
    box.addEventListener('mouseleave', () => {
        box.style.background = 'rgba(255, 255, 255, 0.15)';
        box.style.transform = 'translateY(0)';
    });
    
    const iconDiv = document.createElement('div');
    iconDiv.style.cssText = `
        width: 24px;
        height: 24px;
        color: white;
        opacity: 0.9;
    `;
    iconDiv.innerHTML = icon;
    
    const valueDiv = document.createElement('div');
    valueDiv.style.cssText = `
        font-size: 18px;
        font-weight: 700;
        line-height: 1;
    `;
    valueDiv.textContent = value;
    
    const unitDiv = document.createElement('div');
    unitDiv.style.cssText = `
        font-size: 11px;
        font-weight: 600;
        opacity: 0.8;
        letter-spacing: 0.5px;
    `;
    unitDiv.textContent = unit;
    
    const labelDiv = document.createElement('div');
    labelDiv.style.cssText = `
        font-size: 10px;
        opacity: 0.7;
        margin-top: 2px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
        font-weight: 500;
    `;
    labelDiv.textContent = label;
    
    box.appendChild(iconDiv);
    box.appendChild(valueDiv);
    box.appendChild(unitDiv);
    box.appendChild(labelDiv);
    
    return box;
}
