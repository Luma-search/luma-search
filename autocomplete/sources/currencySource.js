/**
 * Luma Autocomplete – Source: Währungskonverter
 * Fetcht /currency_autocomplete und gibt ein getyptes Ergebnis zurück.
 */

/**
 * @param {string} query
 * @returns {Promise<{ type: 'converter', title: string, score: number } | null>}
 */
export async function currencySource(query) {
    try {
        const res = await fetch(`/currency_autocomplete?q=${encodeURIComponent(query)}`);
        if (!res.ok) return null;
        const results = await res.json();
        if (!results || results.length === 0) return null;
        return { type: 'converter', title: results[0], score: 101 };
    } catch {
        return null;
    }
}
