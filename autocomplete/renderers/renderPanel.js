/**
 * Luma Autocomplete – Renderer: Panel-Orchestrator
 * Entspricht dem "scheduleRender" Pattern aus Algolia autocomplete.ts.
 * Liest den State und rendert alle Komponenten in der richtigen Reihenfolge.
 *
 * Neu:
 * - Section-Header ("Kürzlich gesucht", "Vorschläge", "Trending")
 * - "Suche nach X"-Footer
 * - Keyboard-Hints-Bar
 * - ARIA role="listbox" + role="option" auf alle Items
 * - onFill + onRemove Callbacks weitergereicht
 */

import { renderHistory }     from './renderHistory.js';
import { renderRelated }     from './renderRelated.js';
import { renderAnswer }      from './renderAnswer.js';
import { renderWiki }        from './renderWiki.js';
import { renderAiAnswer }    from './renderAiAnswer.js';
import { renderProduct }     from './renderProduct.js';
import { renderSuggestion }  from './renderSuggestion.js';
import { renderChrono }      from './renderChrono.js';
import { renderDomainGuard } from './renderDomainGuard.js';
import { renderEmoji }       from './renderEmoji.js';
import { renderWatt }        from './renderWatt.js';
import { renderHoliday }     from './renderHoliday.js';
import { renderPassword }    from './renderPassword.js';

// ── Hilfsfunktionen ──────────────────────────────────────────────

/**
 * Fügt einen Section-Header ein (z.B. "Kürzlich gesucht"). [NEU]
 */
function renderSectionHeader(container, label) {
    const h = document.createElement('div');
    h.className = 'ac-section-header';
    h.setAttribute('aria-hidden', 'true');
    h.textContent = label;
    container.appendChild(h);
}

/**
 * "Suche nach X"-Footer-Eintrag ganz unten. [NEU]
 */
function renderSearchFooter(container, query, onSelect) {
    if (!query || query.trim().length < 1) return;
    const div = document.createElement('div');
    div.className = 'autocomplete-item ac-search-footer';
    div.setAttribute('role', 'option');
    const escaped = query.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    div.innerHTML = `
        <span class="ac-search-footer-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </span>
        <span class="ac-search-footer-text">Suche nach &ldquo;<strong>${escaped}</strong>&rdquo;</span>
    `;
    div.addEventListener('click', () => onSelect(query));
    container.appendChild(div);
}

/**
 * Keyboard-Hints-Bar ganz unten. [NEU]
 */
function renderKeyboardHints(container) {
    const bar = document.createElement('div');
    bar.className = 'ac-keyboard-hints';
    bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = `
        <span class="ac-hint"><kbd>↑↓</kbd> Navigieren</span>
        <span class="ac-hint"><kbd>↵</kbd> Suchen</span>
        <span class="ac-hint"><kbd>Tab</kbd> Übernehmen</span>
        <span class="ac-hint"><kbd>Esc</kbd> Schließen</span>
    `;
    container.appendChild(bar);
}

// ── Haupt-Renderer ───────────────────────────────────────────────

/**
 * Rendert das komplette Dropdown-Panel neu basierend auf dem aktuellen State.
 *
 * @param {HTMLElement} wrapper
 * @param {HTMLInputElement} input
 * @param {object} state
 * @param {object} callbacks
 * @param {function(string): void} callbacks.onSelect
 * @param {function(string, string=): void} callbacks.onProductSelect
 * @param {function(): void} callbacks.onClose
 * @param {function(string): void} [callbacks.onFill]   - ↗ Begriff übernehmen [NEU]
 * @param {function(string): void} [callbacks.onRemove] - Verlauf-Eintrag löschen [NEU]
 */
export function renderPanel(wrapper, input, state, callbacks) {
    const { collections, intent, query } = state;
    const { onSelect, onProductSelect, onClose, onFill, onRemove } = callbacks;

    // Merken ob Panel schon offen war (dann keine Einblend-Animation)
    const wasAlreadyOpen = wrapper.classList.contains('autocomplete-open');

    // Altes Panel: NICHT entfernen sondern wiederverwenden wenn möglich
    // (Verhindert Fokus-Verlust durch DOM-Entfernung während der User tippt)
    let existing = document.getElementById('autocomplete-list');
    if (existing && wasAlreadyOpen) {
        // Panel existiert schon → nur Content leeren, Panel selbst bleibt im DOM
        existing.innerHTML = '';
        existing.id = 'autocomplete-list'; // sicherstellen
    } else {
        // Panel existiert nicht oder war geschlossen → altes entfernen, neues erstellen
        if (existing) existing.remove();
        document.body.querySelectorAll('#autocomplete-list').forEach(el => el.remove());
        existing = null;
    }

    // Prüfen ob es überhaupt etwas zu zeigen gibt
    const hasContent = (
        collections.history.length > 0 ||
        collections.related.length > 0 ||
        collections.answer ||
        collections.wiki ||
        collections.chrono ||
        collections.domainGuard ||
        collections.emoji ||
        collections.watt ||
        collections.holiday ||
        collections.password ||
        collections.aiAnswers.length > 0 ||
        collections.products.length > 0 ||
        collections.suggestions.length > 0 ||
        (query.trim().length > 0 && collections.trends?.length > 0)
    );

    // Auch wenn kein Content: bei aktiver Query den Footer zeigen
    const hasQuery = query.trim().length > 0;

    if (!hasContent && !hasQuery) {
        wrapper.classList.remove('autocomplete-open');
        return;
    }

    // Panel wiederverwenden (existing) oder neu erstellen
    const list = existing || document.createElement('div');
    if (!existing) {
        list.id = 'autocomplete-list';
        list.className = 'autocomplete-items';
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Suchvorschläge');
        // mousedown: stopPropagation (verhindert document-mousedown → Panel schließen)
        // preventDefault: verhindert Fokus-Verlust beim Klick auf Panel-Items
        list.addEventListener('mousedown', e => {
            e.stopPropagation();
            e.preventDefault(); // ← KEY FIX: kein blur auf dem Input!
        });
        // Neu an body hängen
        document.body.appendChild(list);
    }
    wrapper.classList.add('autocomplete-open');
    // Animation nur beim echten ersten Öffnen
    if (!wasAlreadyOpen) {
        list.classList.remove('ac-panel-visible');
        requestAnimationFrame(() => list.classList.add('ac-panel-visible'));
    } else {
        list.classList.add('ac-panel-visible'); // sofort sichtbar, kein Flicker
    }

    if (window.innerWidth <= 600) {
        // Mobile: echtes Fullscreen direkt per JS setzen
        Object.assign(list.style, {
            position:     'fixed',
            top:          '0',
            left:         '0',
            right:        '0',
            bottom:       '0',
            width:        '100%',
            height:       '100dvh',
            maxHeight:    '100dvh',
            borderRadius: '0',
            border:       'none',
            paddingTop:   '62px',
            zIndex:       '99999',
            background:   '#242628',
            overflowY:    'auto',
            overflowX:    'hidden',
        });
    } else {
        // Desktop: Position unter dem Input-Feld berechnen
        const rect = wrapper.getBoundingClientRect();
        Object.assign(list.style, {
            position:     'fixed',
            top:          rect.bottom + 'px',
            left:         rect.left + 'px',
            width:        rect.width + 'px',
            maxHeight:    (window.innerHeight - rect.bottom - 10) + 'px',
            borderRadius: '0 0 16px 16px',
            zIndex:       '99999',
        });
    }

    // ── Mobiler Header (nur auf kleinen Screens sichtbar via CSS) ──
    // Bei Wiederverwendung: nur Value updaten, kein neu-erstellen
    let mobileHeader = list.querySelector('.ac-mobile-header');
    let mobileInput;
    if (mobileHeader) {
        // Panel wird wiederverwendet → nur Value synchronisieren
        mobileInput = mobileHeader.querySelector('.ac-mobile-header-input');
        if (mobileInput && mobileInput !== document.activeElement) {
            mobileInput.value = query || '';
        }
    } else {
        mobileHeader = document.createElement('div');
        mobileHeader.className = 'ac-mobile-header';
        mobileHeader.innerHTML = `
            <input
                class="ac-mobile-header-input"
                type="search"
                value="${(query || '').replace(/"/g, '&quot;')}"
                placeholder="${input.placeholder || 'Suchen…'}"
                aria-label="Suche"
                autocomplete="off"
                spellcheck="false"
            >
            <button class="ac-mobile-close" aria-label="Schließen">✕</button>
        `;
        list.prepend(mobileHeader);
        mobileInput = mobileHeader.querySelector('.ac-mobile-header-input');
        mobileInput.addEventListener('input', e => {
            input.value = e.target.value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        // Schließen-Button (nur einmal beim Erstellen registrieren)
        mobileHeader.querySelector('.ac-mobile-close').addEventListener('click', () => {
            onClose?.();
        });
    } // Ende else (neuer Header)

    // Body-Lock: verhindert Hintergrund-Scroll auf Mobile
    if (window.innerWidth <= 600) {
        document.body.classList.add('ac-mobile-open');
    }

    // ── "Suche nach X" – immer als erstes, sofort sichtbar ────────
    renderSearchFooter(list, query, onSelect);

    // ── Verlauf ──────────────────────────────────────────────────
    if (collections.history.length > 0) {
        renderSectionHeader(list, 'Kürzlich gesucht');
        renderHistory(list, collections.history, query, onSelect, onRemove);
    }

    // ── Verwandte Suchbegriffe ───────────────────────────────────
    renderRelated(list, collections.related, onSelect);

    // ── Spezial-Widgets (keine Section-Header nötig) ─────────────
    renderWatt(list, collections.watt);
    renderChrono(list, collections.chrono);
    renderDomainGuard(list, collections.domainGuard);
    renderEmoji(list, collections.emoji, onClose);
    renderHoliday(list, collections.holiday, onClose);
    renderPassword(list, collections.password, onClose);

    // ── Prominente Antwort-Karte ─────────────────────────────────
    renderAnswer(list, collections.answer, onSelect);

    // ── Wikipedia-Karte ──────────────────────────────────────────
    const wikiAlreadyShown = collections.answer?.source === 'wikipedia';
    if (!wikiAlreadyShown) {
        renderWiki(list, collections.wiki, onClose);
    }

    // ── Intent-basierte Reihenfolge ──────────────────────────────
    if (intent.isQuestion) {
        renderAiAnswer(list, collections.aiAnswers, query, onSelect);
    } else if (intent.showProducts) {
        renderProduct(list, collections.products, query, onProductSelect);
    }

    // ── Suchvorschläge mit Section-Header ───────────────────────
    if (collections.suggestions.length > 0) {
        renderSectionHeader(list, 'Vorschläge');
        renderSuggestion(list, collections.suggestions, query, onSelect, onFill);
    }

    // ── ARIA: role="option" + ID für alle navigierbaren Items ────
    const allItems = list.querySelectorAll('.autocomplete-item');
    allItems.forEach((item, idx) => {
        item.setAttribute('role', 'option');
        item.id = `ac-item-${idx}`;
    });

    // ── Active-Item markieren ────────────────────────────────────
    if (state.activeItemId !== null) {
        const items = list.getElementsByClassName('autocomplete-item');
        if (items[state.activeItemId]) {
            items[state.activeItemId].classList.add('autocomplete-active');
        }
    }

    // ── Keyboard-Hints-Bar ganz unten ────────────────────────────
    renderKeyboardHints(list);
}