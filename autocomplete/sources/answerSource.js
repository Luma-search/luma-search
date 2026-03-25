/**
 * Luma Autocomplete – Source: Unified Answer
 * Fetcht /answer_autocomplete (eigene DB → DuckDuckGo → Wikipedia).
 */

/**
 * @param {string} query
 * @returns {Promise<{ source: string, sourceLabel: string, question: string, answer: string, url: string|null, thumbnail: string|null } | null>}
 */
export async function answerSource(query) {
    try {
        const res = await fetch(`/answer_autocomplete?q=${encodeURIComponent(query)}`);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}
