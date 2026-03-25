/**
 * @class KeychainManager v1.0.0
 * @description Sichere Memory-only Passwort-Verwaltung (NICHTS wird gespeichert!)
 * 
 * Features:
 * - ✅ Memory-only (keine Festplatte)
 * - ✅ Automatisches Löschen nach 15 Min
 * - ✅ Keine LocalStorage/Cookies
 * - ✅ Sichere Wertvergleiche mit Timing-Schutz
 * - ✅ Session-basiert, nicht persistent
 * 
 * @author Luma Security
 * @version 1.0.0
 * @license MIT
 */

class KeychainManager {
    constructor() {
        // Memory-only Storage (wird gelöscht wenn Tab geschlossen!)
        this._keychain = new Map();
        
        // Auto-Delete Timeouts
        this._deleteTimers = new Map();
        
        // TTL (Time To Live) in Millisekundene
        this.DEFAULT_TTL = 15 * 60 * 1000;  // 15 Minuten
        
        // Session-ID für Tracking
        this._sessionId = this._generateSessionId();
        
        // Stats sammeln
        this._stats = {
            itemsAdded: 0,
            itemsRetrieved: 0,
            itemsDeleted: 0,
            sessionStart: Date.now()
        };
    }

    /**
     * Speichert ein Passwort (nur im RAM, wird gelöscht nach TTL)
     * @param {string} key - Eindeutiger Schlüssel
     * @param {string} password - Zu speicherndes Passwort
     * @param {number} ttl - Time-to-live in Millisekunden (default 15 Min)
     * @returns {Object} Bestätigung mit Metadaten
     */
    setPassword(key, password, ttl = this.DEFAULT_TTL) {
        if (!key || !password) {
            return this._error("Key und Password erforderlich");
        }

        if (typeof password !== 'string' || password.length === 0) {
            return this._error("Ungültiges Passwort");
        }

        // Lösche alten Timer falls vorhanden
        if (this._deleteTimers.has(key)) {
            clearTimeout(this._deleteTimers.get(key));
        }

        // Speichere im Memory
        const entry = {
            password: password,
            storedAt: Date.now(),
            ttl: ttl,
            expiresAt: Date.now() + ttl,
            accessCount: 0,
            type: 'generated'  // oder 'analyzed'
        };

        this._keychain.set(key, entry);
        this._stats.itemsAdded++;

        // Setze Auto-Delete Timer
        const timer = setTimeout(() => {
            this._deletePassword(key, 'expired');
        }, ttl);

        this._deleteTimers.set(key, timer);

        return {
            success: true,
            key: key,
            message: `Passwort gespeichert (${Math.round(ttl / 60000)} Min Auto-Delete)`,
            expiresAt: new Date(entry.expiresAt).toLocaleTimeString('de-DE')
        };
    }

    /**
     * Ruft ein Passwort ab (nur aus RAM)
     * @param {string} key - Eindeutiger Schlüssel
     * @returns {string|null} Passwort oder null wenn nicht gefunden/abgelaufen
     */
    getPassword(key) {
        const entry = this._keychain.get(key);

        if (!entry) {
            return null;  // Nicht gefunden
        }

        // Prüfe Ablaufdatum
        if (Date.now() > entry.expiresAt) {
            this._deletePassword(key, 'expired');
            return null;
        }

        // Erhöhe Access-Count
        entry.accessCount++;
        this._stats.itemsRetrieved++;

        // Stille Warnung bei zu häufigem Zugriff
        if (entry.accessCount > 20) {
            console.warn(`⚠️ Passwort ${key} wurde über 20x aufgerufen`);
        }

        return entry.password;
    }

    /**
     * Prüft ob ein Passwort existiert (ohne auszulesen)
     */
    hasPassword(key) {
        const entry = this._keychain.get(key);
        if (!entry) return false;

        // Prüfe Ablauf
        if (Date.now() > entry.expiresAt) {
            this._deletePassword(key, 'expired');
            return false;
        }

        return true;
    }

    /**
     * Sicherer Passwort-Vergleich (Timing-Schutz gegen Timing Attacks)
     * @param {string} key - Zu vergleichender Key
     * @param {string} inputPassword - Zu vergleichendes Passwort
     * @returns {boolean} True wenn Passwörter identisch
     */
    comparePassword(key, inputPassword) {
        const stored = this.getPassword(key);

        if (!stored) return false;

        // Timing-safe Vergleich
        return this._constantTimeCompare(stored, inputPassword);
    }

    /**
     * Löscht ein Passwort manuell
     */
    deletePassword(key) {
        return this._deletePassword(key, 'manual');
    }

    /**
     * Löscht ALLE Passwörter (Session-Ende)
     */
    clearAll() {
        // Lösche alle Timer
        for (const timer of this._deleteTimers.values()) {
            clearTimeout(timer);
        }

        const count = this._keychain.size;
        this._keychain.clear();
        this._deleteTimers.clear();

        this._stats.itemsDeleted += count;

        return {
            success: true,
            message: `${count} Passwörter gelöscht`,
            sessionDuration: this._getSessionDuration()
        };
    }

    /**
     * Gibt Keychain-Statistiken zurück (ohne Passwörter!)
     */
    getStats() {
        return {
            type: 'keychain-stats',
            sessionId: this._sessionId,
            currentItems: this._keychain.size,
            totalAdded: this._stats.itemsAdded,
            totalRetrieved: this._stats.itemsRetrieved,
            totalDeleted: this._stats.itemsDeleted,
            sessionDuration: this._getSessionDuration(),
            sessionStart: new Date(this._stats.sessionStart).toLocaleTimeString('de-DE'),
            warning: "⚠️ Alle Passwörter werden nach 15 Min automatisch gelöscht!",
            security: "🔒 Memory-only (nicht auf Festplatte)"
        };
    }

    /**
     * Gibt alle gespeicherten Keys zurück (NICHT die Passwörter!)
     */
    getAllKeys() {
        const keys = [];

        for (const [key, entry] of this._keychain.entries()) {
            if (Date.now() <= entry.expiresAt) {
                const remaining = Math.round((entry.expiresAt - Date.now()) / 1000);
                keys.push({
                    key: key,
                    type: entry.type,
                    accessCount: entry.accessCount,
                    expiresIn: `${remaining}s`,
                    expiresAt: new Date(entry.expiresAt).toLocaleTimeString('de-DE')
                });
            }
        }

        return keys;
    }

    // ─────────────────────────────────────────────────────────────
    // PRIVATE METHODS
    // ─────────────────────────────────────────────────────────────

    _deletePassword(key, reason = 'unknown') {
        const entry = this._keychain.get(key);

        if (!entry) return false;

        // Lösche Timer
        if (this._deleteTimers.has(key)) {
            clearTimeout(this._deleteTimers.get(key));
            this._deleteTimers.delete(key);
        }

        // Überschreibe Speicher vor Löschen (extra Sicherheit)
        entry.password = '\0'.repeat(entry.password.length);

        this._keychain.delete(key);
        this._stats.itemsDeleted++;

        return true;
    }

    /**
     * Sicherer Timing-safe String-Vergleich
     * Verhindert Timing-Attacks durch konstante Ausführungszeit
     */
    _constantTimeCompare(a, b) {
        // Stelle sicher dass beide Strings same Länge haben
        const len = Math.max(a.length, b.length);
        let result = 0;

        for (let i = 0; i < len; i++) {
            const charA = a.charCodeAt(i) || 0;
            const charB = b.charCodeAt(i) || 0;
            result |= charA ^ charB;  // XOR bleibt konstant
        }

        return result === 0;
    }

    _generateSessionId() {
        const arr = new Uint8Array(8);
        crypto.getRandomValues(arr);
        return Array.from(arr, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    _getSessionDuration() {
        const ms = Date.now() - this._stats.sessionStart;
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        return `${minutes}min ${seconds}s`;
    }

    _error(message) {
        return {
            success: false,
            error: true,
            message: message
        };
    }
}

// Dual Export: CommonJS + ES6
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeychainManager;
}

// Only export ES6 in browsers or when explicitly needed
if (typeof window !== 'undefined') {
    window.KeychainManager = KeychainManager;
}
