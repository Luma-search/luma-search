/**
 * Luma Alles-Tab Renderer
 * Pfad: navigations_tabs/alles.js
 * Mit anonymen Reaktionen (👍/😐/👎) von /api/votes
 */

import { getTrustBadgeHtml } from './widgets/trust-badge.js';
import { getKnowledgePanelHtml } from './widgets/knowledge-panel.js';
import { getRelatedQuestionsHtml, initRelatedQuestionsLogic } from './widgets/related-questions.js';
import { CommunityLists } from './widgets/community-lists.js';
import { getAnswerBox, renderAnswerBox, injectAnswerBoxStyles } from './widgets/answer-box.js';
import { renderNewsWidget } from './widgets/news-widget.js';
import { renderProductWidget, injectProductSnippetStyles } from './widgets/product-widget.js';
import { injectAndActivateSearchFilters, updateFilterActiveState } from './widgets/search-filters.js';
import { clearVoteCache } from './widgets/rating-utils.js';
import { renderRecipeWidget } from './widgets/recipe-widget.js';
import { renderResultList } from './widgets/result-list.js';

function detectIsQuestion(query) {
    if (!query || query.trim().length < 3) return false;
    const q = query.toLowerCase().trim();
    if (query.trim().endsWith('?')) return true;
    const fragewörter = [
        'was ist','was sind','was war','was bedeutet','was heißt',
        'wer ist','wer war','wer hat','wer sind',
        'wie ist','wie war','wie funktioniert','wie viel','wie alt',
        'wie groß','wie lange','wie weit','wie oft',
        'wo ist','wo liegt','wo war','wo lebt',
        'wann ist','wann war','wann wurde','wann hat',
        'warum ist','warum war','warum hat',
        'woher kommt','wohin','welche','welcher','welches',
        'wieviel','wie viele','kann man','kann ich','gibt es',
    ];
    if (fragewörter.some(w => q.startsWith(w))) return true;
    const einzelne = ['was','wer','wie','wo','wann','warum','woher','welche'];
    const words = q.split(/\s+/);
    if (words.length >= 2 && einzelne.includes(words[0])) return true;
    if (/(definition|bedeutung|erklärung|erklär|anleitung|tutorial|herkunft)/.test(q)) return true;
    if (/(hauptstadt|einwohner|bevölkerung|fläche|höhe|alter|gründer)\s+(von|des|der|vom)/.test(q)) return true;
    return false;
}

// Cache für Votes — wird bei jeder neuen Suche geleert
function highlightText(text, query) {
    if (!text || !query) return text;
    const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
    if (terms.length === 0) return text;
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = `(${escapedTerms.join('|')})`;
    const regex = new RegExp(pattern, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

/**
 * Erstellt das Filter-Dropdown, fügt es neben den Navigations-Tabs ein
 * und aktiviert die Klick-Handler.
 * Wird von renderAlles() bei jeder Suche aufgerufen.
 * @param {HTMLElement} resultsContainer - Das DOM-Element, in das die Suchergebnisse gerendert werden.
 */

export async function renderAlles(data, container, query, didYouMean, relatedSearches = []) {
    clearVoteCache(); // Immer frische Vote-Daten bei neuer Suche
    container.style.display = 'block';
    container.style.textAlign = 'left';
    container.innerHTML = '';

    // Styles injizieren
    injectAnswerBoxStyles();
    injectProductSnippetStyles();

    // Fügt das Filter-Dropdown neben den Nav-Tabs ein, indem es den Ergebnis-Container als Referenz verwendet.
    injectAndActivateSearchFilters(container);

    // ───────────────────────────────────────────────────────────────────────
    // NEU: "Meintest du...?" oben IMMER anzeigen (nicht nur bei 0 Ergebnissen)
    // ───────────────────────────────────────────────────────────────────────
    let didYouMeanHtml = '';
    if (didYouMean && didYouMean.topSuggestion && didYouMean.topSuggestion !== query) {
        const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        didYouMeanHtml = `
            <div style="background: rgba(123, 167, 247, 0.08); border: 1px solid rgba(123, 167, 247, 0.3); border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; font-size: 14px; color: #bdc1c6;">
                <span style="color: #7ba7f7; font-weight: 600;">Meintest du:</span> 
                <a href="?q=${encodeURIComponent(didYouMean.topSuggestion)}&tab=all&page=1" style="color: #7ba7f7; text-decoration: underline; font-weight: 600; cursor: pointer;">${esc(didYouMean.topSuggestion)}</a>?
                <span style="color: #888898; margin-left: 12px;">(Suche nach &quot;${esc(query)}&quot; stattdessen)</span>
            </div>
        `;
    }

    // ────────────────────────────────────────────────────────────────────────
    // Answer-Box: NUR bei echten Fragen laden, nicht bei normalen Suchwörtern
    // ────────────────────────────────────────────────────────────────────────
    let initialHtml = '';
    if (detectIsQuestion(query)) {
        try {
            const answerBoxData = await getAnswerBox(query);
            if (answerBoxData) {
                initialHtml = renderAnswerBox(answerBoxData);
            }
        } catch (err) {
            console.warn('Answer-Box laden fehlgeschlagen:', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // QUALITÄTS-FILTER: Irrelevante Einzelergebnisse ausblenden
    // Problem: ranking.js gibt manchmal 1 Ergebnis mit sehr niedrigem Semantic-
    // Score zurück (z.B. Schlagershow bei "Olaf Scholz" → 13% Relevanz).
    // Lösung: Wenn weniger als 3 Ergebnisse UND kein Ergebnis hat einen
    // Semantic-Score über 25%, behandle es wie "keine Ergebnisse" –
    // dann greift der Knowledge Graph (Wikipedia) als Fallback.
    // ─────────────────────────────────────────────────────────────────────────
    const hasQualityResults = data && data.length > 0 && (
        data.length >= 3 ||
        data.some(item => (item.semanticScore || 0) > 0.35 || item.isFact || item.isBestMatch)
    );

    if (!data || data.length === 0 || !hasQualityResults) {
        const isLowQuality = data && data.length > 0 && !hasQualityResults;

        // filterHint vom Server (wenn Filter zu streng war)
        const filterHint = data?.filterHint;

        let noResultsHtml = filterHint
            ? `<div style="background:rgba(242,139,130,0.08);border:1px solid rgba(242,139,130,0.3);border-radius:10px;padding:16px 20px;margin-bottom:20px;font-size:14px;color:#f28b82;">
                  ⚠️ ${filterHint}
                  <div style="margin-top:10px;">
                    <a href="?q=${encodeURIComponent(query)}&tab=all&page=1" style="color:#8ab4f8;font-size:13px;">Filter entfernen und alle Ergebnisse zeigen →</a>
                  </div>
               </div>`
            : isLowQuality
                ? `<p style="color: #bdc1c6; margin-top: 20px;">Deine Neugier ist größer als unser Index. "<strong>${query}</strong>" nicht gefunden — <a href="?q=${encodeURIComponent(query)}&tab=all" style="color:#C29A40; text-decoration: none; font-weight: bold;">Tiefer graben?</a></p>`
                : `<p style="color: #bdc1c6; margin-top: 20px;">Deine Neugier ist größer als unsere Datenbank. "<strong>${query}</strong>" nicht gefunden.</p>`;

        let meintestDuBox = '';
        if (didYouMean && didYouMean.message) {
            meintestDuBox = `
                <div class="meintest-du-box" style="background: rgba(123, 167, 247, 0.1); border: 1px solid rgba(123, 167, 247, 0.3); border-radius: 12px; padding: 18px; margin-bottom: 24px; max-width: 100%; width: 100%; box-sizing: border-box;">
                    <div class="meintest-message" style="color: #7ba7f7; font-size: 15px; line-height: 1.6; margin-bottom: 14px; word-wrap: break-word; overflow-wrap: break-word;">
                        ${didYouMean.message}
                    </div>
                    <div class="meintest-question" style="font-size: 13px; color: #bdc1c6; margin-bottom: 12px; word-wrap: break-word; overflow-wrap: break-word;">
                        ${didYouMean.wouldYouLike}
                    </div>
                    <a href="?q=${encodeURIComponent(didYouMean.topSuggestion)}&tab=all&page=1" class="meintest-btn" style="display: inline-block; background: #7ba7f7; color: #0f0f11; padding: 8px 16px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; transition: background 0.2s;">
                        Nach "${didYouMean.topSuggestion}" suchen
                    </a>
                </div>
            `;
        } else if (didYouMeanHtml) {
            meintestDuBox = didYouMeanHtml;
        }

        // Reihenfolge: Meintest du -> Answer Box -> Keine Ergebnisse Text
        const mainContentHtml = initialHtml + noResultsHtml;

        // Knowledge Panel auch bei 0 oder schlechten Ergebnissen versuchen → Wikipedia als Fallback
        const panelHtml = await getKnowledgePanelHtml(null, query);
        if (panelHtml) {
            container.innerHTML = `
                ${meintestDuBox}
                <div class="results-layout">
                    <div class="results-col-main">${mainContentHtml}</div>
                    <div class="results-col-panel" style="min-width:300px;max-width:420px;width:380px;flex-shrink:0;">${panelHtml}</div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="results-col-solo">
                    ${meintestDuBox}
                    ${mainContentHtml}
                </div>
            `;
        }
        return;
    }

    // 0. Farb-Karte (Spezial-Ergebnis für Hex/Farben)
    const colorResult = data.find(item => item.type === 'color');
    const normalData = data.filter(item => item.type !== 'color');
    let html = '';

    // --- WIDGETS (News, Rezepte, Produkte) zuerst rendern (ganz oben) ---
    const recipeItems = [];
    const newsItems = [];
    const productItems = [];

    html += await renderNewsWidget(query, normalData, recipeItems, newsItems);
    html += renderRecipeWidget(query, normalData, recipeItems);
    html += await renderProductWidget(query);

    // --- DANN Highlights (Farbe, Best Match, Fakten) ---
    if (colorResult) {
        const luminance = 0.299 * colorResult.r + 0.587 * colorResult.g + 0.114 * colorResult.b;
        const textColor = luminance > 160 ? '#111' : '#fff';
        html += `
            <div style="background: #303134; border: 1px solid #5f6368; border-radius: 12px; padding: 20px; margin-bottom: 28px; display: flex; align-items: center; gap: 20px;">
                <div style="width: 80px; height: 80px; border-radius: 10px; background: ${colorResult.hex}; border: 1px solid #5f6368; flex-shrink: 0; display: flex; align-items: center; justify-content: center;">
                    <span style="font-size: 11px; font-weight: 600; color: ${textColor}; font-family: monospace;">${colorResult.hex}</span>
                </div>
                <div>
                    <div style="font-size: 12px; color: #8ab4f8; font-weight: 600; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">Farbe</div>
                    <div style="font-size: 18px; font-weight: 600; color: #e8eaed; margin-bottom: 8px; font-family: monospace;">${colorResult.hex}</div>
                    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                        <span style="font-size: 13px; color: #bdc1c6; font-family: monospace;">${colorResult.rgb}</span>
                        <span style="font-size: 13px; color: #bdc1c6; font-family: monospace;">${colorResult.hsl}</span>
                    </div>
                </div>
            </div>
        `;
    }

    // 1. "Best Match" (Featured Box) oder Fakten-Box
    const bestMatch = normalData.find(item => item.isBestMatch);
    const fact = normalData.find(item => item.isFact);

    if (bestMatch) {
        const contentText = bestMatch.content || bestMatch.contentSnippet || '';
        const plainTextContent = contentText.replace(/<mark>/gi, '').replace(/<\/mark>/gi, '');
        const snippet = plainTextContent.length > 280 ? plainTextContent.substring(0, 280) + '...' : plainTextContent;

        let hostname = '';
        try { hostname = new URL(bestMatch.url).hostname.replace('www.', ''); } catch(e) {}
        const faviconUrl = hostname ? `https://www.google.com/s2/favicons?sz=32&domain=${hostname}` : '';

        html += `
            <div class="featured-answer" style="background: #1a1a1e; border: 1px solid #3c4043; border-left: 4px solid #8ab4f8; border-radius: 12px; padding: 20px; margin-bottom: 30px; position: relative; transition: border-color 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span style="background: rgba(138, 180, 248, 0.15); color: #8ab4f8; font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; letter-spacing: 0.5px;">Top Ergebnis</span>
                    <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9aa0a6;">
                        ${faviconUrl ? `<img src="${faviconUrl}" style="width: 14px; height: 14px; border-radius: 2px;" alt="">` : ''}
                        <span>${hostname}</span>
                    </div>
                </div>

                <a href="${bestMatch.url}" class="result-title" style="display: block; font-size: 20px; color: #8ab4f8; text-decoration: none; font-weight: 400; margin-bottom: 10px; line-height: 1.3;">${bestMatch.title}</a>
                
                <p class="result-snippet" style="color: #bdc1c6; font-size: 14px; line-height: 1.6; margin: 0; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;">
                    ${highlightText(snippet, query)}
                </p>
            </div>
        `;
    } else if (fact) {
        html += `
            <div style="background: #1a1a1e; border: 1px solid #35353a; border-left: 4px solid #7ba7f7; border-radius: 12px; padding: 20px; margin-bottom: 30px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                <span style="display: inline-block; background: rgba(123, 167, 247, 0.15); color: #7ba7f7; padding: 3px 10px; border-radius: 40px; font-size: 11px; margin-bottom: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Luma Info</span>
                <h2 style="margin: 0 0 10px 0; font-size: 19px; color: #ededef;">${fact.title}</h2>
                <p style="color: #bdc1c6; font-size: 14px; line-height: 1.6; margin-bottom: 12px;">${fact.content}</p>
                <a href="${fact.url}" style="font-size: 13px; color: #7ba7f7; text-decoration: none; font-weight: 500;">Mehr erfahren →</a>
            </div>
        `;
    }

    // NEU: "Ähnliche Fragen"-Box einfügen
    const relatedQuestionsHtml = await getRelatedQuestionsHtml(normalData, query);
    if (relatedQuestionsHtml) {
        html += relatedQuestionsHtml;
    }

    // Ergebnisliste — ausgelagert in widgets/result-list.js
    // Nur recipeItems ausschließen — news/product haben eigene Fetches und sind nicht in normalData
    const widgetUrls = new Set([...recipeItems.map(i => i.url)]);
    html += await renderResultList(normalData, widgetUrls, relatedSearches);

    // Knowledge Panel: Nur für Personen/Unternehmen/Orte – nicht für generische Begriffe
    // Ausschlussliste: Begriffe die nie ein Panel bekommen sollen
    const panelBlacklist = /^(nachrichten|news|wetter|sport|politik|wirtschaft|suche|bilder|videos|fragen|aktuell|heute|aktuelles)$/i;
    let panelHtml = '';
    if (!panelBlacklist.test(query.trim())) {
        let panelItem = data.find(item =>
            item.url &&
            item.url.includes('wikipedia.org') &&
            (item.semanticScore || 0) > 0.4
        );
        panelHtml = await getKnowledgePanelHtml(panelItem, query);
    }

    if (panelHtml) {
        container.innerHTML = `
            ${didYouMeanHtml}
            <div class="results-layout">
                <div class="results-col-main">
                    ${initialHtml}
                    ${html}
                </div>
                <div class="results-col-panel" style="min-width:300px;max-width:420px;width:380px;flex-shrink:0;">
                    ${panelHtml}
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="results-col-solo">
                ${didYouMeanHtml}
                ${initialHtml}
                ${html}
            </div>
        `;
    }

    // Community Chat IMMER rendern IN DEN SEPERATEN CONTAINER (nicht im HTML einbauen!)
    const communityContainer = document.getElementById('community-lists-container');
    if (communityContainer) {
        CommunityLists.render('community-lists-container', query);
    }

    // NEU: Interaktivität für Ähnliche Fragen aktivieren
    initRelatedQuestionsLogic();

    // Speichere die URLs für trust.html (localStorage Sync)
    const urls = normalData.filter(i => i.url).map(item => {
        let domain = '';
        try { domain = new URL(item.url).hostname.replace(/^www\./, ''); } catch {}
        return { domain, url: item.url, title: item.title };
    });
    localStorage.setItem('luma_current_results', JSON.stringify({
        query: query,
        urls: urls,
        timestamp: Date.now()
    }));
}