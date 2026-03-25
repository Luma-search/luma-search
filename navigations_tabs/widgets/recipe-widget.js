/**
 * Recipe Widget
 * Pfad: navigations_tabs/widgets/recipe-widget.js
 * Zeigt Rezept-Karten bei Koch-Suchanfragen (3 Karten nebeneinander)
 */

function escAttr(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/**
 * Rendert das Rezepte-Widget und gibt HTML-String zurück.
 * @param {string} query
 * @param {Array} normalData
 * @param {Array} recipeItems - wird mit gefundenen Rezepten befüllt (mutiert)
 * @returns {string} HTML-String oder ''
 */
export function renderRecipeWidget(query, normalData, recipeItems) {
    const isRecipeQuery = /chefkoch|rezept|kochen|backen|braten|grillen|kochbar|eatsmarter|lecker|küche|speise/i.test(query);
    if (!isRecipeQuery) return '';

    const candidates = normalData.filter(item =>
        item.image &&
        (
            /chefkoch\.de|kochbar\.de|eatsmarter\.de|lecker\.de|essen-und-trinken\.de|springlane\.de|kitchenstories\.com|einfachbacken\.de/i.test(item.url) ||
            /rezept|kochen|backen|zubereitung|zutaten|gericht/i.test(item.title)
        ) &&
        !item.isBestMatch && !item.isFact
    );

    if (candidates.length < 3) return '';

    recipeItems.push(...candidates.slice(0, 3));

    return `<div class="recipe-widget" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 32px;">
        ${recipeItems.map(item => {
            let hostname = '';
            try { hostname = new URL(item.url).hostname.replace('www.', ''); } catch(e) {}
            return `<a href="${item.url}" target="_blank" style="text-decoration: none; background: #202124; border: 1px solid #3c4043; border-radius: 12px; overflow: hidden; transition: transform 0.2s, border-color 0.2s; display: flex; flex-direction: column;" onmouseover="this.style.transform='translateY(-2px)';this.style.borderColor='#5f6368'" onmouseout="this.style.transform='translateY(0)';this.style.borderColor='#3c4043'">
                <div style="height: 120px; overflow: hidden; background: #303134;">
                    <img src="${item.image}" style="width: 100%; height: 100%; object-fit: cover;" alt="${escAttr(item.title)}" onerror="this.style.display='none'">
                </div>
                <div style="padding: 12px; flex: 1; display: flex; flex-direction: column;">
                    <div style="font-size: 14px; font-weight: 500; color: #e8eaed; margin-bottom: 6px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">${item.title}</div>
                    <div style="font-size: 11px; color: #9aa0a6; margin-top: auto; display: flex; align-items: center; gap: 4px;">
                        ${hostname ? `<img src="https://www.google.com/s2/favicons?sz=32&domain=${hostname}" style="width:12px;height:12px;border-radius:2px;">` : ''}
                        ${hostname}
                    </div>
                </div>
            </a>`;
        }).join('')}
    </div>`;
}