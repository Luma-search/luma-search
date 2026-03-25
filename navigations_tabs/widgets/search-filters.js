/**
 * Search Filters Widget
 * Pfad: navigations_tabs/widgets/search-filters.js
 * Fügt den Filter-Button (Zeit/Sprache) neben die Nav-Tabs ein.
 */

export function updateFilterActiveState() {
    const urlParams = new URLSearchParams(window.location.search);
    const time = urlParams.get('time') || 'all';
    const lang = urlParams.get('lang') || 'all';
    const isAnyActive = time !== 'all' || lang !== 'all';
    const btn = document.getElementById('luma-filter-btn');
    if (btn) {
        btn.style.borderColor = isAnyActive ? '#8ab4f8' : '#5f6368';
    }
}

export function injectAndActivateSearchFilters(resultsContainer) {
    try {
        if (document.getElementById('luma-filter-dropdown-container')) {
            updateFilterActiveState();
            return;
        }

        // ── Robuste Tab-Container-Suche (3 Strategien) ──────────────────────────
        let tabsContainer = null;

        // Strategie 1: Bekannte IDs/Klassen
        const knownSelectors = ['#search-tabs', '#nav-tabs', '.search-tabs', '.nav-tabs', '[data-tabs]', '#tabs'];
        for (const sel of knownSelectors) {
            const el = document.querySelector(sel);
            if (el && !el.contains(resultsContainer)) { tabsContainer = el; break; }
        }

        // Strategie 2: <nav> Element
        if (!tabsContainer) {
            const navEl = document.querySelector('nav');
            if (navEl && !navEl.contains(resultsContainer)) tabsContainer = navEl;
        }

        // Strategie 3: Heuristik — Element mit Alles+Bilder+Nachrichten Text
        if (!tabsContainer) {
            for (const el of document.querySelectorAll('div, ul')) {
                const text = el.textContent || '';
                if (text.includes('Alles') && text.includes('Bilder') && text.includes('Nachrichten')
                    && el.children.length > 2 && el.children.length < 20
                    && !el.contains(resultsContainer)) {
                    tabsContainer = el;
                    break;
                }
            }
        }

        // Strategie 4: Fallback
        if (!tabsContainer) {
            tabsContainer = resultsContainer.parentElement || resultsContainer;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const time = urlParams.get('time') || 'all';
        const lang = urlParams.get('lang') || 'all';
        const isTimeActive = time !== 'all';
        const isLangActive = lang !== 'all';
        const isAnyFilterActive = isTimeActive || isLangActive;

        const buildUrl = (changes) => {
            const p = new URLSearchParams(window.location.search);
            for (const [k, v] of Object.entries(changes)) {
                if (v === 'all') p.delete(k);
                else p.set(k, v);
            }
            p.set('page', '1');
            return '?' + p.toString();
        };

        const timeOpts = [{ k: 'all', l: 'Beliebig' }, { k: 'd', l: 'Letzte 24 Std.' }, { k: 'w', l: 'Letzte Woche' }, { k: 'm', l: 'Letzter Monat' }];
        const langOpts = [{ k: 'all', l: 'Alle' }, { k: 'de', l: 'Deutsch' }, { k: 'en', l: 'Englisch' }];

        const renderGroup = (items, current, param) => items.map(i => {
            const active = current === i.k;
            const style = active ? 'background:rgba(138,180,248,0.1); color:#8ab4f8;' : 'background:transparent; color:#bdc1c6;';
            const hover = !active ? `onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='transparent'"` : '';
            const checkmark = active ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8ab4f8" stroke-width="3" style="margin-left:auto;flex-shrink:0;"><polyline points="20 6 9 17 4 12"></polyline></svg>` : '';
            return `<a href="${buildUrl({[param]: i.k})}" ${hover} style="display:flex; align-items:center; gap:8px; text-decoration:none; padding:8px 14px; font-size:13px; transition:all 0.2s; ${style}">${i.l}${checkmark}</a>`;
        }).join('');

        const inlineChips = [];
        if (isTimeActive) {
            const label = timeOpts.find(o => o.k === time)?.l || time;
            inlineChips.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(138,180,248,0.2);color:#8ab4f8;font-size:11px;padding:1px 6px;border-radius:10px;white-space:nowrap;">⏱ ${label}<a href="${buildUrl({time:'all'})}" onclick="event.stopPropagation()" style="color:#8ab4f8;text-decoration:none;margin-left:2px;font-size:12px;line-height:1;">✕</a></span>`);
        }
        if (isLangActive) {
            const label = langOpts.find(o => o.k === lang)?.l || lang;
            inlineChips.push(`<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(138,180,248,0.2);color:#8ab4f8;font-size:11px;padding:1px 6px;border-radius:10px;white-space:nowrap;">🌐 ${label}<a href="${buildUrl({lang:'all'})}" onclick="event.stopPropagation()" style="color:#8ab4f8;text-decoration:none;margin-left:2px;font-size:12px;line-height:1;">✕</a></span>`);
        }

        const btnBorderColor = isAnyFilterActive ? '#8ab4f8' : '#5f6368';
        const btnBg = isAnyFilterActive ? 'rgba(138,180,248,0.08)' : 'transparent';

        const btnHtml = `
            <div id="luma-filter-dropdown-container" style="position: relative; display: inline-flex; align-items: center; margin-left: 16px; vertical-align: bottom;">
                <button id="luma-filter-btn" style="background: ${btnBg}; border: 1px solid ${btnBorderColor}; color: #e8eaed; padding: 6px 12px; border-radius: 8px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${isAnyFilterActive ? '#8ab4f8' : 'currentColor'}" stroke-width="2"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"></path></svg>
                    <span style="color:${isAnyFilterActive ? '#8ab4f8' : '#e8eaed'}">Filter</span>
                    ${inlineChips.length > 0 ? `<span style="display:inline-flex;gap:4px;align-items:center;">${inlineChips.join('')}</span>` : ''}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${isAnyFilterActive ? '#8ab4f8' : 'currentColor'}" stroke-width="2"><path d="m6 9 6 6 6-6"></path></svg>
                </button>
            </div>`;

        const popupHtml = `
            <div id="luma-filter-popup" style="display: none; position: fixed; background: #2d2e30; border: 1px solid #5f6368; border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.6); z-index: 99999; min-width: 220px; overflow: hidden;">
                <div class="filter-popup-group">
                    <div style="padding: 10px 14px 4px; font-size: 11px; color: #9aa0a6; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">⏱ Zeit</div>
                    ${renderGroup(timeOpts, time, 'time')}
                </div>
                <div style="border-top: 1px solid #3c4043;"></div>
                <div class="filter-popup-group">
                    <div style="padding: 10px 14px 4px; font-size: 11px; color: #9aa0a6; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">🌐 Sprache</div>
                    ${renderGroup(langOpts, lang, 'lang')}
                </div>
                ${isAnyFilterActive ? `
                <div style="border-top: 1px solid #3c4043; padding: 8px 14px;">
                    <a href="${buildUrl({time:'all', lang:'all'})}" style="display:block;text-align:center;color:#f28b82;font-size:12px;text-decoration:none;padding:6px;border-radius:6px;" onmouseover="this.style.background='rgba(242,139,130,0.1)'" onmouseout="this.style.background='transparent'">Alle Filter entfernen</a>
                </div>
                ` : ''}
            </div>`;

        tabsContainer.insertAdjacentHTML('beforeend', btnHtml);
        document.body.insertAdjacentHTML('beforeend', popupHtml);

        const filterBtn   = document.getElementById('luma-filter-btn');
        const filterPopup = document.getElementById('luma-filter-popup');

        if (filterBtn && filterPopup) {
            filterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = filterPopup.style.display === 'block';
                if (isOpen) {
                    filterPopup.style.display = 'none';
                } else {
                    const rect = filterBtn.getBoundingClientRect();
                    filterPopup.style.top  = (rect.bottom + 8) + 'px';
                    filterPopup.style.left = rect.left + 'px';
                    filterPopup.style.display = 'block';
                }
            });

            document.addEventListener('click', (e) => {
                if (!e.target.closest('#luma-filter-dropdown-container') &&
                    !e.target.closest('#luma-filter-popup')) {
                    filterPopup.style.display = 'none';
                }
            });

            const repositionPopup = () => {
                if (filterPopup.style.display === 'block') {
                    const rect = filterBtn.getBoundingClientRect();
                    filterPopup.style.top  = (rect.bottom + 8) + 'px';
                    filterPopup.style.left = rect.left + 'px';
                }
            };
            window.addEventListener('scroll', repositionPopup, { passive: true });
            window.addEventListener('resize', repositionPopup, { passive: true });
        }
    } catch(e) { console.error('Fehler beim Injizieren der Such-Filter:', e); }
}