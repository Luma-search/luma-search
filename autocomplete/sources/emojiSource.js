/**
 * Luma Autocomplete – Source: Emoji-Suche
 * Wird ausgelöst wenn Query mit ":" beginnt.
 * Modus 1: ":herz"  → passende Emojis
 * Modus 2: "::"     → alle Emojis (Picker)
 */

export async function emojiSource(query) {
    const raw = query.trim();
    if (!raw.startsWith(':')) return null;
    try {
        const res = await fetch(`/emoji_autocomplete?q=${encodeURIComponent(raw)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || (!data.results?.length && !data.showPicker)) return null;
        return data; // Enthält bereits type: 'emoji'
    } catch {
        return null;
    }
}
