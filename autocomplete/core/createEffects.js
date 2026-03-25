/**
 * Luma Autocomplete – Core: Effect-Wrapper
 * Inspiriert vom Algolia createEffectWrapper Pattern aus autocomplete.ts (Zeilen 36, 181-340).
 *
 * Verwaltet Side-Effects (z.B. Event-Listener) mit Cleanup-Funktionen.
 * Jeder Effect kann eine Cleanup-Funktion zurückgeben.
 *
 * Verwendung:
 *   const { runEffect, cleanupEffects } = createEffects();
 *
 *   runEffect(() => {
 *     input.addEventListener('input', handler);
 *     return () => input.removeEventListener('input', handler);
 *   });
 *
 *   // Beim Aufräumen (destroy):
 *   cleanupEffects();
 */

/**
 * @returns {{ runEffect: function(function(): function|void): void, cleanupEffects: function(): void, runEffects: function(): void }}
 */
export function createEffects() {
    // Speichert { effect, cleanup } Paare
    const effects = [];

    /**
     * Führt einen Effect aus und speichert dessen Cleanup-Funktion.
     * @param {function(): (function(): void)|void} effectFn
     */
    function runEffect(effectFn) {
        const cleanup = effectFn();
        effects.push({ effectFn, cleanup: cleanup || (() => {}) });
    }

    /**
     * Ruft alle Cleanup-Funktionen auf und leert die Effect-Liste.
     */
    function cleanupEffects() {
        effects.forEach(({ cleanup }) => cleanup());
        effects.length = 0;
    }

    /**
     * Cleanup + Re-Run aller registrierten Effects.
     * Nützlich wenn sich Options geändert haben (Algolia's update()).
     */
    function runEffects() {
        const savedEffects = effects.map(e => e.effectFn);
        cleanupEffects();
        savedEffects.forEach(fn => runEffect(fn));
    }

    return { runEffect, cleanupEffects, runEffects };
}
