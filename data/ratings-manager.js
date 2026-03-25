/**
 * RATINGS MANAGER
 * Speichert und verwaltet Nutzerbewertungen für Domains
 * Dateiformat: data/ratings.json
 */

const fs = require('fs');
const path = require('path');

const RATINGS_FILE = path.join(__dirname, 'ratings.json');

/**
 * Lädt alle Bewertungen aus der JSON-Datei
 */
function loadRatings() {
    try {
        if (fs.existsSync(RATINGS_FILE)) {
            const data = fs.readFileSync(RATINGS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('❌ Fehler beim Laden von ratings.json:', error.message);
    }
    return {};
}

/**
 * Speichert Bewertungen in die JSON-Datei
 */
function saveRatings(ratings) {
    try {
        fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratings, null, 2), 'utf8');
    } catch (error) {
        console.error('❌ Fehler beim Speichern von ratings.json:', error.message);
    }
}

/**
 * Fügt eine neue Bewertung hinzu
 * @param {string} domain - Domain name (z.B. "example.com")
 * @param {number} stars - Sternebewertung (1-5)
 * @param {string} user - Nutzername/Pseudonym
 * @param {string} text - Bewertungstext
 */
function addRating(domain, stars, user, text) {
    if (!domain || !stars || !user || !text) {
        throw new Error('Alle Felder sind erforderlich');
    }

    if (stars < 1 || stars > 5 || !Number.isInteger(stars)) {
        throw new Error('Sterne müssen zwischen 1 und 5 liegen');
    }

    const ratings = loadRatings();
    
    // Normalisiere Domain (entferne www., konvertiere zu Kleinbuchstaben)
    const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();
    
    if (!ratings[normalizedDomain]) {
        ratings[normalizedDomain] = [];
    }

    // Füge neue Bewertung hinzu mit Zeitstempel
    ratings[normalizedDomain].push({
        stars: parseInt(stars, 10),
        user: String(user).substring(0, 50),  // Max 50 Zeichen
        text: String(text).substring(0, 500), // Max 500 Zeichen
        timestamp: Date.now(),
        approved: false // Moderation erforderlich (optional)
    });

    saveRatings(ratings);
    return true;
}

/**
 * Holt alle Bewertungen für eine Domain
 * @param {string} domain - Domain name
 * @returns {Array} Array von Bewertungen
 */
function getRatings(domain) {
    const ratings = loadRatings();
    
    // Normalisiere Domain
    const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();
    
    return ratings[normalizedDomain] || [];
}

/**
 * Berechnet den Durchschnitt der Sterne für eine Domain
 * @param {string} domain - Domain name
 * @returns {Object} { average: number, count: number }
 */
function getAverageRating(domain) {
    const ratings = getRatings(domain);
    
    if (ratings.length === 0) {
        return { average: 0, count: 0, approved: 0 };
    }

    const sum = ratings.reduce((acc, r) => acc + r.stars, 0);
    const average = (sum / ratings.length).toFixed(1);
    
    return {
        average: parseFloat(average),
        count: ratings.length,
        approved: ratings.filter(r => r.approved).length
    };
}

/**
 * Holt alle Domänen mit ihren Ratings
 * @returns {Object} { domain: { average, count, ratings } }
 */
function getAllRatings() {
    const ratings = loadRatings();
    const result = {};

    for (const [domain, ratingsList] of Object.entries(ratings)) {
        const sum = ratingsList.reduce((acc, r) => acc + r.stars, 0);
        result[domain] = {
            average: parseFloat((sum / ratingsList.length).toFixed(1)),
            count: ratingsList.length,
            ratings: ratingsList
        };
    }

    return result;
}

/**
 * Konvertiert Domain-URL zu normalisierten Domain-Namen
 * @param {string} url - URL (z.B. "https://www.example.com/page")
 * @returns {string} Domain name (z.B. "example.com")
 */
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
        return url.replace(/^www\./, '').toLowerCase();
    }
}

module.exports = {
    addRating,
    getRatings,
    getAverageRating,
    getAllRatings,
    extractDomain
};
