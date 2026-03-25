/**
 * Luma Autocomplete – Source: Domain-Alters-Check
 * Nur auslösen wenn Query wie eine Domain aussieht.
 */

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export async function domainGuardSource(query) {
    if (!DOMAIN_PATTERN.test(query.trim()) || query.includes(' ')) return null;
    try {
        const res = await fetch(`/domain_guard_autocomplete?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) return null;
        const results = await res.json();
        if (!results || results.length === 0) return null;
        return results[0]; // Enthält bereits type: 'domain_guard'
    } catch {
        return null;
    }
}
