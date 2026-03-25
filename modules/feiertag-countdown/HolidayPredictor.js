/**
 * @class HolidayPredictor
 * @description Berechnet deutsche Feiertage (fest & beweglich) ohne externe APIs.
 * Nutzt Gaußsche Osterformel und komplett offline Countdown-Arithmetik.
 * 
 * @author Luma Search
 * @version 2.1.0
 * @license MIT
 * 
 * Features:
 * - ✅ Gaußsche Osterformel für korrekte Oster-Berechnungen
 * - ✅ Alle bundesdeutschen Feiertage (fest + beweglich)
 * - ✅ Countdown-Berechnung (Tage bis Feiertag)
 * - ✅ Natürlichsprachige Ausgabe
 * - ✅ Caching für Performance
 * - ✅ Offline: Keine API-Abhängigkeiten
 */
class HolidayPredictor {
    constructor() {
        // Wochentags-Namen (German)
        this.WEEKDAYS = [
            "Sonntag", "Montag", "Dienstag", "Mittwoch", 
            "Donnerstag", "Freitag", "Samstag"
        ];
        
        // Monats-Namen (German)
        this.MONTHS = [
            "Januar", "Februar", "März", "April", "Mai", "Juni",
            "Juli", "August", "September", "Oktober", "November", "Dezember"
        ];
        
        // Holiday Erkennungs-Keywords
        this.HOLIDAY_KEYWORDS = {
            'ostern': ['ostern', 'oster'],
            'weihnachten': ['weihnacht'],
            'neujahr': ['neujahr', 'silvester', 'jahreswechsel'],
            'pfingst': ['pfings'],
            'himmelfahrt': ['himmelfahrt', 'christi himmelfahrt'],
            'nächster feiertag': ['nächster feiertag', 'nächste feiertag', 'feiertag', 'kommender feiertag']
        };
        
        // Cache für Performance
        this._holidayCache = new Map();
        this._cacheExpiresIn = 24 * 60 * 60 * 1000; // 24h Cache
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC METHODS
    // ─────────────────────────────────────────────────────────────

    /**
     * Berechnet das Ostersonntag-Datum für ein Jahr (Gaußsche Osterformel)
     * @param {number} year - Jahreszahl (z.B. 2026)
     * @returns {Date} Ostersonntag-Datum
     * 
     * @example
     * const hp = new HolidayPredictor();
     * hp.getEasterSunday(2026)  // Date: Sonntag, 5. April 2026
     */
    getEasterSunday(year) {
        // Gaußsche Osterformel
        const a = year % 19;
        const b = Math.floor(year / 100);
        const c = year % 100;
        const d = Math.floor(b / 4);
        const e = b % 4;
        const f = Math.floor((b + 8) / 25);
        const g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30;
        const i = Math.floor(c / 4);
        const k = c % 4;
        const l = (32 + 2 * e + 2 * i - h - k) % 7;
        const m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31);
        const day = ((h + l - 7 * m + 114) % 31) + 1;
        
        return new Date(year, month - 1, day);
    }

    /**
     * Generiert alle bundesweiten deutschen Feiertage für ein Jahr
     * @param {number} year - Jahreszahl
     * @param {Object} options - { useCache: boolean }
     * @returns {Array} Array von Holiday-Objekten
     * 
     * @example
     * hp.getHolidays(2026)
     * // Returns: [
     * //   { name: 'Neujahr', date: Date, icon: '🎆' },
     * //   { name: 'Karfreitag', date: Date, icon: '✝️' },
     * //   ...
     * // ]
     */
    getHolidays(year, options = {}) {
        const { useCache = true } = options;
        const cacheKey = `holidays_${year}`;
        
        // Cache Check
        if (useCache && this._holidayCache.has(cacheKey)) {
            return this._holidayCache.get(cacheKey);
        }
        
        const easter = this.getEasterSunday(year);
        const addDays = (date, days) => {
            const d = new Date(date);
            d.setDate(d.getDate() + days);
            return d;
        };

        // Alle bundesdeutschen Feiertage (fest + beweglich)
        const holidays = [
            // Feste Feiertage
            { name: "Neujahr", date: new Date(year, 0, 1), icon: "🎆", type: "fixed" },
            { name: "Tag der Arbeit", date: new Date(year, 4, 1), icon: "🛠️", type: "fixed" },
            { name: "Tag der Deutschen Einheit", date: new Date(year, 9, 3), icon: "🇩🇪", type: "fixed" },
            { name: "1. Weihnachtstag", date: new Date(year, 11, 25), icon: "🎄", type: "fixed" },
            { name: "2. Weihnachtstag", date: new Date(year, 11, 26), icon: "🎁", type: "fixed" },
            
            // Bewegliche Feiertage (Oster-abhängig)
            { name: "Karfreitag", date: addDays(easter, -2), icon: "✝️", type: "moveable" },
            { name: "Ostersonntag", date: easter, icon: "🐰", type: "moveable" },
            { name: "Ostermontag", date: addDays(easter, 1), icon: "🥚", type: "moveable" },
            { name: "Christi Himmelfahrt", date: addDays(easter, 39), icon: "☁️", type: "moveable" },
            { name: "Pfingstsonntag", date: addDays(easter, 49), icon: "🕊️", type: "moveable" },
            { name: "Pfingstmontag", date: addDays(easter, 50), icon: "📅", type: "moveable" }
        ];

        // Sortieren nach Datum
        const sorted = holidays.sort((a, b) => a.date - b.date);
        
        // Cache speichern
        if (useCache) {
            this._holidayCache.set(cacheKey, sorted);
        }
        
        return sorted;
    }

    /**
     * Sucht den nächsten Feiertag basierend auf Query-String oder Datum
     * @param {string} query - "Ostern", "Weihnachten", "nächster Feiertag" etc.
     * @param {Date} baseDate - Referenzdatum (Standard: Heute)
     * @returns {Object|null} Holiday-Result oder null
     * 
     * @example
     * hp.getNextHoliday('Ostern')              // → { title: 'Ostersonntag', output: '🐰 In 24 Tagen...', daysRemaining: 24 }
     * hp.getNextHoliday('nächster Feiertag')   // → { ... }
     * hp.getNextHoliday('Weihnachten')         // → { ... }
     */
    getNextHoliday(query = "nächster feiertag", baseDate = new Date()) {
        // Normalisiere Anfrage
        const now = new Date(baseDate);
        now.setHours(0, 0, 0, 0);
        
        const searchTerm = query.toLowerCase().trim();
        
        // Sammle Feiertage aus aktuellem und nächstem Jahr
        let allHolidays = [
            ...this.getHolidays(now.getFullYear()),
            ...this.getHolidays(now.getFullYear() + 1)
        ];

        let holiday = null;

        // Spezielle Feiertag-Suche
        if (searchTerm.includes('ostern') || searchTerm.includes('oster')) {
            // Suche nach "Ostern" im Namen (Ostersonntag, Ostermontag, Karfreitag)
            holiday = allHolidays.find(h => 
                (h.name.toLowerCase().includes('ostern') || h.name.toLowerCase().includes('kar')) && h.date >= now
            );
        } else if (searchTerm.includes('weihnacht')) {
            // Suche nach Weihnachtsfeiertag
            holiday = allHolidays.find(h => 
                h.name.toLowerCase().includes('weihnacht') && h.date >= now
            );
        } else if (searchTerm.includes('pfings')) {
            // Suche nach Pfingst
            holiday = allHolidays.find(h => 
                h.name.toLowerCase().includes('pfings') && h.date >= now
            );
        } else if (searchTerm.includes('himmelfahrt')) {
            // Suche nach Himmelfahrt
            holiday = allHolidays.find(h => 
                h.name.toLowerCase().includes('himmelfahrt') && h.date >= now
            );
        } else if (searchTerm.includes('neujahr') || searchTerm.includes('jahreswechsel')) {
            // Suche nach Neujahr
            holiday = allHolidays.find(h => 
                (h.name.toLowerCase().includes('neujahr') || h.name === 'Neujahr') && h.date >= now
            );
        } else {
            // Standard: Nächster kommender Feiertag (beliebig)
            holiday = allHolidays.find(h => h.date >= now);
        }

        return holiday ? this._formatResult(holiday, now) : null;
    }

    /**
     * Prüft ob eine Query ein Holiday-Query ist
     * @param {string} query - Suchquery
     * @returns {boolean}
     */
    isHolidayQuery(query) {
        if (!query || query.length < 3) return false;
        const search = query.toLowerCase();
        
        // Prüfe gegen alle Keywords
        for (const [, keywords] of Object.entries(this.HOLIDAY_KEYWORDS)) {
            for (const keyword of keywords) {
                if (search.includes(keyword)) return true;
            }
        }
        return false;
    }

    /**
     * Liefert alle kommenden Feiertage für die nächsten N Wochen
     * @param {number} weeksAhead - Anzahl der Wochen
     * @returns {Array}
     */
    getUpcomingHolidays(weeksAhead = 12) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + (weeksAhead * 7));
        
        let allHolidays = [
            ...this.getHolidays(now.getFullYear()),
            ...this.getHolidays(now.getFullYear() + 1)
        ];
        
        return allHolidays
            .filter(h => h.date >= now && h.date <= endDate)
            .map(h => ({
                ...h,
                daysRemaining: Math.ceil((h.date - now) / (1000 * 60 * 60 * 24))
            }));
    }

    /**
     * PROAKTIV: Liefert Holiday-Vorschlag wenn ein Feiertag in den nächsten N Tagen ansteht
     * (Automatische Ank\u00fcndigung ohne dass der Nutzer danach sucht)
     * @param {number} daysAhead - Schwellenwert in Tagen (default 7 = in 7 Tagen oder früher)
     * @param {Date} baseDate - Referenzdatum
     * @returns {Object|null} Holiday wenn in daysAhead Tagen ansteht, sonst null
     * 
     * @example
     * hp.getSuggestedHoliday(7)  // Wenn in 7 Tagen ein Feiertag ansteht
     * // → { name: 'Weihnachtstag', icon: '🎄', output: '🎄 In 19 Tagen...', ... }
     */
    getSuggestedHoliday(daysAhead = 7, baseDate = new Date()) {
        const now = new Date(baseDate);
        now.setHours(0, 0, 0, 0);
        
        const endDate = new Date(now);
        endDate.setDate(endDate.getDate() + daysAhead);
        
        let allHolidays = [
            ...this.getHolidays(now.getFullYear()),
            ...this.getHolidays(now.getFullYear() + 1)
        ];
        
        // Finde den nächsten Feiertag der in den nächsten daysAhead Tagen ansteht
        const suggested = allHolidays.find(h => h.date >= now && h.date <= endDate);
        
        return suggested ? this._formatResult(suggested, now) : null;
    }

    /**
     * Cache leeren
     */
    clearCache() {
        this._holidayCache.clear();
    }

    // ─────────────────────────────────────────────────────────────
    // PRIVATE METHODS
    // ─────────────────────────────────────────────────────────────

    _formatResult(holiday, now) {
        const diffTime = holiday.date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const dayName = this.WEEKDAYS[holiday.date.getDay()];
        const monthName = this.MONTHS[holiday.date.getMonth()];
        const dateString = `${dayName}, der ${holiday.date.getDate()}. ${monthName}`;

        // Natürlichsprachige Ausgabe
        let relativeText;
        if (diffDays === 0) {
            relativeText = "Heute";
        } else if (diffDays === 1) {
            relativeText = "Morgen";
        } else if (diffDays <= 7) {
            relativeText = `In ${diffDays} Tagen`;
        } else {
            relativeText = `In ${diffDays} Tagen`;
        }
        
        return {
            type: 'holiday',
            name: holiday.name,
            icon: holiday.icon,
            output: `${holiday.icon} ${relativeText} (${dateString})`,
            dateString,
            daysRemaining: diffDays,
            date: holiday.date,
            confidence: 0.95
        };
    }
}

// Dual Export: Unterstützung für Node.js (CommonJS) und Browser (ES6)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HolidayPredictor;
} else if (typeof exports !== 'undefined') {
    exports.default = HolidayPredictor;
}

// ES6 Export für Browser/Module
if (typeof window === 'undefined') {
    // Node.js Umgebung - exports oben
} else {
    // Browser Umgebung
    window.HolidayPredictor = HolidayPredictor;
}