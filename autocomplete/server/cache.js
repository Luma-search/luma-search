/**
 * Luma Autocomplete – Cache Utility
 * Einfacher LRU-ähnlicher Map-Cache mit Max-Size-Eviction.
 */

'use strict';

/**
 * Erstellt einen neuen Cache.
 * @param {number} maxSize – Maximale Anzahl Einträge
 * @returns {{ get, set, has }}
 */
function createCache(maxSize = 500) {
    const store = new Map();

    function has(key) {
        return store.has(key);
    }

    function get(key) {
        return store.get(key);
    }

    function set(key, value) {
        if (store.size >= maxSize) {
            // Ältesten Eintrag (ersten Key) löschen
            store.delete(store.keys().next().value);
        }
        store.set(key, value);
    }

    return { has, get, set };
}

module.exports = { createCache };
