/**
 * Luma Autocomplete – Core: Reaktive Werte
 * Inspiriert vom Algolia createReactiveWrapper Pattern aus autocomplete.ts (Zeilen 37, 43-87).
 *
 * Ein reaktiver Wert ist eine Funktion deren Ergebnis gecacht wird und auf Anfrage
 * neu berechnet werden kann (z.B. wenn sich Options oder Query ändern).
 *
 * Verwendung:
 *   const { reactive, runReactives } = createReactive();
 *
 *   const highlightRegex = reactive(() =>
 *     new RegExp(`(${escapeRegex(state.query)})`, 'gi')
 *   );
 *
 *   // Zugriff:
 *   highlightRegex.value  // → RegExp
 *
 *   // Nach Query-Änderung neu berechnen:
 *   runReactives();
 */

/**
 * @returns {{ reactive: function(function(): any): { value: any }, runReactives: function(): void }}
 */
export function createReactive() {
    const reactives = [];

    /**
     * Erstellt einen reaktiven Wert.
     * @template T
     * @param {function(): T} computeFn
     * @returns {{ get value(): T }}
     */
    function reactive(computeFn) {
        let cached = computeFn();
        const ref = {
            get value() { return cached; },
            recompute() { cached = computeFn(); }
        };
        reactives.push(ref);
        return ref;
    }

    /**
     * Berechnet alle reaktiven Werte neu.
     */
    function runReactives() {
        reactives.forEach(ref => ref.recompute());
    }

    return { reactive, runReactives };
}
