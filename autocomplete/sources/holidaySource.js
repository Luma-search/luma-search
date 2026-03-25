/**
 * Luma Autocomplete – Source: Feiertag-Countdown
 * Erkennt Holiday-Queries und zeigt Countdown-Informationen an
 * 
 * Triggers auf: "Ostern", "Weihnachten", "Pfingsten", "nächster Feiertag", etc.
 * Gibt Instant-Answer mit Countdown zurück ohne API-Call (rein lokal)
 */

// Holiday-Keywords für locale Erkennung
const HOLIDAY_KEYWORDS = {
    ostern: /\bostern\b/i,
    weihnacht: /\bweihnacht/i,
    pfingst: /\bpfings/i,
    neujahr: /\bneujahr|silvester|jahreswechsel\b/i,
    'feiertag': /\b(nächster\s+feiertag|kommender\s+feiertag|feiertag)\b/i,
    himmelfahrt: /\bchrist[i]?\s+himmelfahrt|himmelfahrt\b/i
};

/**
 * Holiday Source mit zwei Modi:
 * 1. REAKTIV: Wenn User nach Holiday sucht (z.B. "Ostern") → zeige das
 * 2. PROAKTIV: Automatisch Holiday vorschlagen wenn in 7 Tagen ansteht (auch ohne Suche)
 * 
 * @param {string} query 
 * @returns {Promise<Object|null>}
 */
export async function holidaySource(query) {
    try {
        // REAKTIV: Ist das ein Holiday-Query (z.B. "Ostern", "Weihnachten")?
        if (query && query.length >= 3) {
            let matchedHoliday = null;
            for (const [keyword, regex] of Object.entries(HOLIDAY_KEYWORDS)) {
                if (regex.test(query)) {
                    matchedHoliday = keyword;
                    break;
                }
            }
            
            if (matchedHoliday) {
                // User sucht explizit nach Holiday → zeige das
                const res = await fetch(`/holiday_autocomplete?q=${encodeURIComponent(query)}`);
                if (res.ok) {
                    const result = await res.json();
                    if (result) {
                        return {
                            type: 'holiday',
                            name: result.name,
                            icon: result.icon,
                            output: result.output,
                            daysRemaining: result.daysRemaining,
                            dateString: result.dateString,
                            confidence: result.confidence,
                            mode: 'reactive'  // Nutzer sucht explizit
                        };
                    }
                }
            }
        }
        
        // PROAKTIV: Automatisch Holiday-Suggestion wenn in 7 Tagen ansteht
        // (Unabhängig davon ob Nutzer danach sucht!)
        const suggestRes = await fetch('/holiday_autocomplete?suggest=true&days=7');
        if (suggestRes.ok) {
            const suggested = await suggestRes.json();
            if (suggested) {
                return {
                    type: 'holiday',
                    name: suggested.name,
                    icon: suggested.icon,
                    output: suggested.output,
                    daysRemaining: suggested.daysRemaining,
                    dateString: suggested.dateString,
                    confidence: suggested.confidence,
                    mode: 'proactive'  // Automatischer Vorschlag
                };
            }
        }
        
        return null;
    } catch (err) {
        console.error('Holiday source error:', err);
        return null;
    }
}
