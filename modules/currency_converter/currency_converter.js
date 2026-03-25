/**
 * Luma Currency Converter Modul
 * Optimierte Währungsumrechnung mit verbesserter Performance und Fehlerbehandlung
 * Pfad: C:\Users\Felix\Desktop\Luma\Luma\modules\currency_converter\currency_converter.js
 */

// Konstanten
const BASE_CURRENCY = 'EUR';
const DECIMAL_LOCALE = 'de-DE';
const DECIMAL_OPTIONS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
const CONVERSION_REGEX = /(\d+(?:[.,]\d+)?)\s*([a-zA-Z€$]+)\s*(?:in|to|nach)\s*([a-zA-Z€$]+)/i;

/**
 * Basis-Wechselkurse (EUR ist die Basiswährung)
 * Hinweis: In einer Produktionsumgebung sollten diese von einer API geladen werden
 * @type {Object<string, number>}
 */
const EXCHANGE_RATES = Object.freeze({
    'EUR': 1,
    'USD': 1.08,
    'GBP': 0.85,
    'JPY': 162.5,
    'CHF': 0.97,
    'CAD': 1.47,
    'AUD': 1.65,
});

/**
 * Währungs-Aliase und Symbole für flexible Eingabe
 * @type {Object<string, string>}
 */
const CURRENCY_ALIASES = Object.freeze({
    '€': 'EUR',
    '$': 'USD',
    'dollar': 'USD',
    'doller': 'USD',
    'dollars': 'USD',
    'euro': 'EUR',
    'euros': 'EUR',
    'pfund': 'GBP',
    'pfunde': 'GBP',
    'yen': 'JPY',
    'franken': 'CHF',
});

/**
 * Normalisiert die Dezimalschreibweise und konvertiert Kommas zu Punkten
 * @param {string} input - Die zu normalisierende Eingabe
 * @returns {string} Normalisierte Eingabe
 */
function normalizeDecimal(input) {
    return String(input).replace(',', '.');
}

/**
 * Extrahiert und validiert Währungscode aus Benutzeringabe
 * @param {string} currencyInput - Die Währungseingabe (kann Symbol oder Name sein)
 * @returns {string|null} Der standardisierte Währungscode oder null
 */
function resolveCurrency(currencyInput) {
    if (!currencyInput) return null;

    const normalized = currencyInput.toLowerCase();
    
    // Versuche zunächst im Alias-Dictionary zu finden
    if (CURRENCY_ALIASES[normalized]) {
        return CURRENCY_ALIASES[normalized];
    }

    // Falls nicht im Alias vorhanden, versuche als Code direkt
    const upperCurrency = normalized.toUpperCase();
    return EXCHANGE_RATES[upperCurrency] ? upperCurrency : null;
}

/**
 * Formatiert einen Betrag mit lokalspezifischen Einstellungen
 * @param {number} amount - Der zu formatierende Betrag
 * @returns {string} Formatierter Betrag
 */
function formatAmount(amount) {
    return Number(amount).toLocaleString(DECIMAL_LOCALE, DECIMAL_OPTIONS);
}

/**
 * Konvertiert einen Betrag zwischen zwei Währungen
 * @param {number} amount - Der zu konvertierende Betrag
 * @param {string} fromCurrency - Quellwährungscode
 * @param {string} toCurrency - Zielwährungscode
 * @returns {number} Der konvertierte Betrag
 */
function calculateConversion(amount, fromCurrency, toCurrency) {
    const rateFromCurrency = EXCHANGE_RATES[fromCurrency];
    const rateToCurrency = EXCHANGE_RATES[toCurrency];

    if (!rateFromCurrency || !rateToCurrency) {
        return null;
    }

    // Umrechnung über die Basiswährung (EUR)
    const amountInBase = amount / rateFromCurrency;
    return amountInBase * rateToCurrency;
}

/**
 * Hauptfunktion: Konvertiert Währungen basierend auf Benutzeranfrage
 * @param {string} query - Die Benutzeranfrage (z.B. "100 EUR in USD")
 * @returns {string|null} Formatiertes Ergebnis oder null wenn keine gültige Anfrage
 */
function convertCurrency(query) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return null;
    }

    // Dezimalschreibweise normalisieren
    const normalizedQuery = normalizeDecimal(query.trim());

    // Anfrage mit Regex analysieren
    const match = normalizedQuery.match(CONVERSION_REGEX);
    if (!match) {
        return null; // Keine gültige Umrechnungsanfrage
    }

    // Extrahiere Komponenten
    const amount = parseFloat(match[1]);
    const fromCurrencyInput = match[2];
    const toCurrencyInput = match[3];

    // Validiere Betrag
    if (isNaN(amount) || amount <= 0) {
        return null; // Ungültiger Betrag
    }

    // Resolve Währungscodes
    const fromCurrency = resolveCurrency(fromCurrencyInput);
    const toCurrency = resolveCurrency(toCurrencyInput);

    if (!fromCurrency || !toCurrency) {
        return null; // Unbekannte Währung
    }

    // Berechne Konversion
    const convertedAmount = calculateConversion(amount, fromCurrency, toCurrency);
    
    if (convertedAmount === null) {
        return null;
    }

    // Formatiere und gebe Ergebnis zurück
    const formattedOriginal = formatAmount(amount);
    const formattedConverted = formatAmount(convertedAmount);

    return `${formattedOriginal} ${fromCurrency} sind ca. ${formattedConverted} ${toCurrency}.`;
}

/**
 * Leben die verfügbaren Währungen auf
 * @returns {Array<string>} Array mit allen verfügbaren Währungscodes
 */
function getAvailableCurrencies() {
    return Object.keys(EXCHANGE_RATES);
}

/**
 * Exportiert Funktionen für Node.js
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        convertCurrency,
        getAvailableCurrencies,
        EXCHANGE_RATES,
        CURRENCY_ALIASES,
    };
}
