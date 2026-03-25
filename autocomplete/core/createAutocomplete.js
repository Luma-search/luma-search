/**
 * Luma Autocomplete – Core: Engine
 */

import { createStore }    from './createStore.js';
import { stateReducer, initialState } from './stateReducer.js';
import { createEffects }  from './createEffects.js';
import { debounce }       from '../utils/debounce.js';
import { getSearchHistory, removeFromHistory } from '../utils/history.js';
import { closeAllLists, createClearButton }    from '../utils/domHelpers.js';
import { renderPanel }    from '../renderers/renderPanel.js';
import {
    detectIsQuestion,
    detectIsPersonOrEntity,
    detectShowProducts
} from '../utils/intentDetector.js';

import { calculatorSource }      from '../sources/calculatorSource.js';
import { currencySource }        from '../sources/currencySource.js';
import { suggestionsSource }     from '../sources/suggestionsSource.js';
// DEAKTIVIERT: Answer und Wiki werden jetzt im Suchergebnis-Tab (alles.js) angezeigt, nicht in der Autocomplete
// import { answerSource }          from '../sources/answerSource.js';
// import { wikiSource }            from '../sources/wikiSource.js';
import { relatedSource }         from '../sources/relatedSource.js';
import { productSource }         from '../sources/productSource.js';
import { queryTrendSource, trendingQueriesSource, hotQueriesSource } from '../sources/queryTrendSource.js';
import { keywordDatabaseSource } from '../sources/keywordDatabaseSource.js';
import { chronoSource }          from '../sources/chronoSource.js';
import { domainGuardSource }     from '../sources/domainGuardSource.js';
import { emojiSource }           from '../sources/emojiSource.js';
import { wattSource }            from '../sources/wattSource.js';
import { holidaySource }         from '../sources/holidaySource.js';
import { passwordSource }        from '../sources/passwordSource.js';

export function createAutocomplete({ input, wrapper }) {
    const { runEffect, cleanupEffects } = createEffects();
    const store = createStore(stateReducer, initialState, onStoreStateChange);

    let currentTrends = [];
    let currentAbortController = null;

    let hotSet = new Set();
    const refreshHotSet = async () => {
        try { hotSet = await hotQueriesSource(60, 2); } catch { }
    };
    refreshHotSet();
    const hotSetIntervalId = setInterval(refreshHotSet, 2 * 60 * 1000);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-haspopup', 'listbox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', 'autocomplete-list');

    // ── Clear-Button ──────────────────────────────────────────────
    createClearButton(input, wrapper, function onClear() {
        input.value = '';
        wrapper.classList.remove('has-value');
        store.dispatch({ type: 'SET_QUERY', payload: '' });
        store.dispatch({ type: 'SET_COLLECTIONS', payload: {
            suggestions: [], answer: null, wiki: null, related: [],
            products: [], aiAnswers: [], chrono: null, domainGuard: null,
            emoji: null, watt: null, holiday: null, password: null,
            history: getSearchHistory().slice(0, 5),
        }});
        store.dispatch({ type: 'OPEN' });
        input.focus();
    });

    // ── State-Change Handler ──────────────────────────────────────
    function onStoreStateChange({ prevState, state }) {
        if (state.status !== prevState.status) {
            wrapper.setAttribute('data-status', state.status);
        }

        input.setAttribute('aria-expanded', String(state.isOpen));
        if (state.activeItemId !== null) {
            input.setAttribute('aria-activedescendant', `ac-item-${state.activeItemId}`);
        } else {
            input.removeAttribute('aria-activedescendant');
        }

        const collectionsChanged = state.collections !== prevState.collections;
        const openChanged        = state.isOpen !== prevState.isOpen;
        const activeChanged      = state.activeItemId !== prevState.activeItemId;

        if (openChanged && !state.isOpen) {
            const panel = document.getElementById('autocomplete-list');
            if (panel) panel.remove();
            wrapper.classList.remove('autocomplete-open');
            return;
        }

        if (activeChanged && !collectionsChanged && !openChanged) {
            const list = document.getElementById('autocomplete-list');
            if (list) {
                const items = list.getElementsByClassName('autocomplete-item');
                Array.from(items).forEach((item, idx) => {
                    item.classList.toggle('autocomplete-active', idx === state.activeItemId);
                    if (idx === state.activeItemId) item.scrollIntoView({ block: 'nearest' });
                });
            }
            return;
        }

        if (collectionsChanged || openChanged) {
            renderPanel(wrapper, input, state, {
                onSelect(query) {
                    input.value = query;
                    wrapper.classList.toggle('has-value', query.length > 0);
                    if (query.trim().length >= 2) {
                        try {
                            const hist = JSON.parse(localStorage.getItem('luma_search_history') || '[]');
                            const filtered = hist.filter(h => h.toLowerCase() !== query.toLowerCase());
                            filtered.unshift(query.trim());
                            localStorage.setItem('luma_search_history', JSON.stringify(filtered.slice(0, 20)));
                        } catch (_) {}
                    }
                    store.dispatch({ type: 'CLOSE' });
                    const form = input.closest('form');
                    if (form) {
                        try { form.requestSubmit(); } catch (_) { form.submit(); }
                    }
                },
                onProductSelect(query, url) {
                    if (url) {
                        window.location.href = url;
                    } else {
                        input.value = query;
                        wrapper.classList.toggle('has-value', query.length > 0);
                        store.dispatch({ type: 'CLOSE' });
                        const form = input.closest('form');
                        if (form) {
                            try { form.requestSubmit(); } catch (_) { form.submit(); }
                        }
                    }
                },
                onClose() {
                    store.dispatch({ type: 'CLOSE' });
                },
                onFill(query) {
                    input.value = query;
                    wrapper.classList.toggle('has-value', query.length > 0);
                    input.focus();
                    input.setSelectionRange(query.length, query.length);
                },
                onRemove(query) {
                    removeFromHistory(query);
                    const currentState = store.getState();
                    const freshHistory = getSearchHistory()
                        .filter(h => h.toLowerCase().includes(currentState.query.toLowerCase()))
                        .slice(0, 3);
                    store.dispatch({ type: 'SET_COLLECTIONS', payload: { history: freshHistory } });
                }
            });
        }
    }

    // ── Sources ───────────────────────────────────────────────────
    async function fetchAllSources(query) {
        if (currentAbortController) currentAbortController.abort();
        currentAbortController = new AbortController();
        const { signal } = currentAbortController;

        store.dispatch({ type: 'SET_STATUS', payload: 'loading' });

        const historyItems = getSearchHistory()
            .filter(h => h.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 3);

        const [
            keywordDbResults, calcResult, currResult, productResults,
            mainSuggestions, relatedTerms,
            chronoResult, domainGuardResult, emojiResult, wattResult,
            holidayResult, passwordResult, trendSuggestionsResult
        ] = await Promise.allSettled([
            keywordDatabaseSource(query), calculatorSource(query),
            currencySource(query), productSource(query),
            suggestionsSource(query),
            relatedSource(query),
            chronoSource(query), domainGuardSource(query),
            emojiSource(query), wattSource(query),
            holidaySource(query), passwordSource(query),
            queryTrendSource(query)
        ]);

        const getValue = r => r.status === 'fulfilled' ? r.value : null;
        if (signal.aborted) return;

        const keywords        = getValue(keywordDbResults) || [];
        const calc            = getValue(calcResult);
        const curr            = getValue(currResult);
        const products        = getValue(productResults) || [];
        const suggestions     = getValue(mainSuggestions) || [];
        const related         = getValue(relatedTerms) || [];
        const chrono          = getValue(chronoResult);
        const domainGuard     = getValue(domainGuardResult);
        const emoji           = getValue(emojiResult);
        const watt            = getValue(wattResult);
        const holiday         = getValue(holidayResult);
        const password        = getValue(passwordResult);
        const trendSuggestions = getValue(trendSuggestionsResult) || [];

        const trendMap = new Map();
        trendSuggestions.forEach(t => {
            const key = (t.query || t.title || '').toLowerCase().trim();
            if (key) trendMap.set(key, t);
        });

        const markHot = items => items.map(item => {
            const key = (item.title || item.query || '').toLowerCase().trim();
            const trendData = trendMap.get(key);
            return {
                ...item,
                isHot:        (hotSet.size > 0 && hotSet.has(key)) || (trendData?.ist_trending === true),
                ist_trending:  trendData?.ist_trending  || item.ist_trending  || false,
                trend_score:   trendData?.trend_score   || item.trend_score   || 0,
                trendLabel:    trendData?.trendLabel    || item.trendLabel    || null,
                weekly_total:  trendData?.weekly_total  || 0
            };
        });

        const seen = new Set();
        const allSuggestions = [
            ...markHot(keywords),
            ...(curr ? [curr] : []),
            ...(calc ? [calc] : []),
            ...markHot(suggestions),
        ].filter(item => {
            const key = (item.title || '').toLowerCase().trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const isQuestion       = detectIsQuestion(query);
        const isPersonOrEntity = false; // DEAKTIVIERT: Answer/Wiki werden nicht mehr in Autocomplete geladen
        const answer           = null;  // DEAKTIVIERT: Antworten im Suchergebnis-Tab
        const wiki             = null;  // DEAKTIVIERT: Wikipedia im Suchergebnis-Tab
        const showProducts     = detectShowProducts(products.length > 0, isQuestion, isPersonOrEntity);

        store.dispatch({
            type: 'SET_COLLECTIONS',
            payload: {
                history: historyItems, related, answer, wiki, chrono,
                domainGuard, emoji, watt, holiday, password,
                aiAnswers: [], products, suggestions: allSuggestions,
                trends: currentTrends
            }
        });
        store.dispatch({ type: 'SET_INTENT', payload: { isQuestion, isPersonOrEntity, showProducts } });
        store.dispatch({ type: 'SET_STATUS', payload: 'idle' });

        const hasContent = allSuggestions.length > 0 || products.length > 0 ||
            historyItems.length > 0 || related.length > 0 ||
            answer || wiki || password || currentTrends.length > 0;
        store.dispatch({ type: 'SET_IS_OPEN', payload: Boolean(hasContent) || query.length > 0 });
    }

    // ── Keyboard Navigation ───────────────────────────────────────
    function getNavigableItems() {
        const list = document.getElementById('autocomplete-list');
        if (!list) return [];
        return Array.from(list.getElementsByClassName('autocomplete-item'));
    }

    function addActive(items, idx) {
        items.forEach(i => i.classList.remove('autocomplete-active'));
        if (idx >= 0 && idx < items.length) {
            items[idx].classList.add('autocomplete-active');
            items[idx].scrollIntoView({ block: 'nearest' });
        }
    }

    // ── Trends laden ──────────────────────────────────────────────
    (async () => {
        try {
            const trends = await trendingQueriesSource(7, 5);
            currentTrends = trends || [];
            store.dispatch({ type: 'SET_COLLECTIONS', payload: { trends: currentTrends } });
        } catch { currentTrends = []; }
    })();

    // ── Input ─────────────────────────────────────────────────────
    runEffect(() => {
        const handler = debounce(function () {
            const val = input.value;
            wrapper.classList.toggle('has-value', val.length > 0);
            store.dispatch({ type: 'SET_QUERY', payload: val });
            if (!val || val.length < 1) {
                store.dispatch({ type: 'SET_COLLECTIONS', payload: {
                    suggestions: [], answer: null, wiki: null, related: [],
                    products: [], aiAnswers: [], chrono: null, domainGuard: null,
                    emoji: null, watt: null, holiday: null, password: null,
                    history: getSearchHistory().slice(0, 5),
                }});
                if (document.activeElement === input) store.dispatch({ type: 'OPEN' });
                return;
            }
            fetchAllSources(val).catch(() => store.dispatch({ type: 'SET_STATUS', payload: 'error' }));
        }, 150);
        input.addEventListener('input', handler);
        return () => input.removeEventListener('input', handler);
    });

    // ── Focus ─────────────────────────────────────────────────────
    runEffect(() => {
        const handler = function () {
            if (!store.getState().isOpen) store.dispatch({ type: 'OPEN' });
        };
        input.addEventListener('focus', handler);
        return () => input.removeEventListener('focus', handler);
    });

    // ── Blur ──────────────────────────────────────────────────────
    runEffect(() => {
        const handler = function (e) {
            const goesTo = e.relatedTarget;
            if (goesTo && (wrapper.contains(goesTo) || document.getElementById('autocomplete-list')?.contains(goesTo))) return;
            setTimeout(() => {
                if (document.activeElement !== input) store.dispatch({ type: 'CLOSE' });
            }, 150);
        };
        input.addEventListener('blur', handler);
        return () => input.removeEventListener('blur', handler);
    });

    // ── Click auf Input ───────────────────────────────────────────
    runEffect(() => {
        const handler = function (e) {
            e.stopPropagation();
            if (!store.getState().isOpen) store.dispatch({ type: 'OPEN' });
        };
        input.addEventListener('click', handler);
        return () => input.removeEventListener('click', handler);
    });

    // ── Keyboard: EIN Handler für alles ──────────────────────────
    // Wichtig: nur ein keydown-Listener, damit Enter nie doppelt feuert
    runEffect(() => {
        const handler = function (e) {
            const state = store.getState();
            const items = getNavigableItems();
            let currentIdx = state.activeItemId !== null ? state.activeItemId : -1;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentIdx = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
                store.dispatch({ type: 'SET_ACTIVE_ITEM', payload: currentIdx });
                addActive(items, currentIdx);

            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentIdx = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
                store.dispatch({ type: 'SET_ACTIVE_ITEM', payload: currentIdx });
                addActive(items, currentIdx);

            } else if (e.key === 'Tab') {
                const firstSuggestion = state.collections.suggestions[0];
                if (firstSuggestion && state.isOpen) {
                    e.preventDefault();
                    const q = firstSuggestion.title;
                    input.value = q;
                    wrapper.classList.toggle('has-value', q.length > 0);
                    store.dispatch({ type: 'SET_QUERY', payload: q });
                    input.setSelectionRange(q.length, q.length);
                }

            } else if (e.key === 'Enter') {
                // Wert bestimmen: aktives Item ODER freier Text
                let q = null;
                if (currentIdx > -1 && items[currentIdx]) {
                    const hidden = items[currentIdx].querySelector('input[type="hidden"]');
                    const textEl = items[currentIdx].querySelector('.autocomplete-text');
                    q = hidden?.value || textEl?.textContent.trim() || null;
                }
                if (!q) q = input.value.trim();
                if (!q) return;

                // Input befüllen + History
                input.value = q;
                wrapper.classList.toggle('has-value', q.length > 0);
                if (q.length >= 2) {
                    try {
                        const hist = JSON.parse(localStorage.getItem('luma_search_history') || '[]');
                        const filtered = hist.filter(h => h.toLowerCase() !== q.toLowerCase());
                        filtered.unshift(q);
                        localStorage.setItem('luma_search_history', JSON.stringify(filtered.slice(0, 20)));
                    } catch (_) {}
                }
                store.dispatch({ type: 'CLOSE' });
                // Kein e.preventDefault() → Browser submitted das Form nativ immer

            } else if (e.key === 'Escape') {
                store.dispatch({ type: 'CLOSE' });
            }
        };
        input.addEventListener('keydown', handler);
        return () => input.removeEventListener('keydown', handler);
    });

    // ── Document mousedown → Panel schließen ─────────────────────
    runEffect(() => {
        const handler = function (e) {
            if (wrapper.contains(e.target)) return;
            const panel = document.getElementById('autocomplete-list');
            if (panel && panel.contains(e.target)) return;
            store.dispatch({ type: 'CLOSE' });
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    });

    // ── Shortcut: / und Strg+K ────────────────────────────────────
    runEffect(() => {
        const handler = function (e) {
            const tag = document.activeElement?.tagName;
            const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable;
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault(); input.focus(); input.select();
            } else if (e.key === '/' && !isEditable) {
                e.preventDefault(); input.focus(); input.select();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    });

    // ── Destroy ───────────────────────────────────────────────────
    function destroy() {
        if (currentAbortController) currentAbortController.abort();
        clearInterval(hotSetIntervalId);
        cleanupEffects();
        const panel = document.getElementById('autocomplete-list');
        if (panel) panel.remove();
        ['role','aria-autocomplete','aria-haspopup','aria-expanded',
         'aria-controls','aria-activedescendant'].forEach(a => input.removeAttribute(a));
    }

    return { destroy };
}