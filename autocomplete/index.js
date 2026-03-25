/**
 * Luma Autocomplete – Haupteinstiegspunkt
 *
 * Wird geladen via: <script type="module" src="/autocomplete/index.js">
 *
 * Architektur inspiriert von Algolia Autocomplete:
 *   - createAutocomplete (Core-Engine mit Store, Effects, Sources)
 *   - createStore / stateReducer (State Management)
 *   - createEffects (Event-Listener Lifecycle)
 *   - Sources (getrennte API-Fetch-Module)
 *   - Renderer (getrennte DOM-Builder)
 */

import { injectStyles, createWrapper } from './utils/domHelpers.js';
import { createAutocomplete }          from './core/createAutocomplete.js';

// Styles einfügen
injectStyles();

// Input finden
const input = document.getElementById('searchInput');
if (input) {
    // Input in Wrapper einschließen
    const wrapper = createWrapper(input);

    // Autocomplete-Engine starten
    const ac = createAutocomplete({ input, wrapper });

    // Cleanup beim Verlassen der Seite (optional, für SPA-Kompatibilität)
    window.addEventListener('beforeunload', () => ac.destroy(), { once: true });
}
