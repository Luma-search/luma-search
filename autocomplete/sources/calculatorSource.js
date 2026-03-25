/**
 * Luma Autocomplete – Source: Taschenrechner
 * Fetcht /calculator_autocomplete und gibt ein getyptes Ergebnis zurück.
 */

/**
 * @param {string} query
 * @returns {Promise<{ type: 'calculator', title: string, score: number } | null>}
 */
export async function calculatorSource(query) {
    try {
        const res = await fetch(`/calculator_autocomplete?q=${encodeURIComponent(query)}`);
        if (!res.ok) return null;
        const results = await res.json();
        if (!results || results.length === 0) return null;
        return { type: 'calculator', title: results[0], score: 100 };
    } catch {
        return null;
    }
}
