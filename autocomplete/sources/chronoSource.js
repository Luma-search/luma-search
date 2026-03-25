/**
 * Luma Autocomplete – Source: Unix-Timestamp Konverter
 */

export async function chronoSource(query) {
    try {
        const res = await fetch(`/chrono_autocomplete?q=${encodeURIComponent(query)}`);
        if (!res.ok) return null;
        const results = await res.json();
        if (!results || results.length === 0) return null;
        return { type: 'timestamp', ...results[0] };
    } catch {
        return null;
    }
}
