/**
 * Luma Calculator Modul
 * Pfad: C:\Users\Felix\Desktop\Luma\Luma\modules\calculator\calculator.js
 */

function calculate(expression) {
    if (!expression) return "Keine Eingabe";

    // 1. Vorbereitung & Bereinigung
    // Kleinbuchstaben, Leerzeichen weg, Komma zu Punkt
    expression = expression.toLowerCase().replace(/\s/g, '').replace(/,/g, '.');

    try {
        // 2. Ersetzungen für wissenschaftliche Funktionen
        // Ersetzt "pi" durch den echten Wert
        expression = expression.replace(/pi/g, Math.PI);
        
        // Ersetzt "sqrt(x)" durch "Math.sqrt(x)"
        expression = expression.replace(/sqrt\(/g, 'Math.sqrt(');
        
        // Ersetzt "^" durch den Potenz-Operator "**" (ES6 Standard)
        expression = expression.replace(/\^/g, '**');

        // 3. Spezialfälle für intuitive Eingabe
        // Implizite Multiplikation vor Klammern: 5(2) -> 5*(2)
        expression = expression.replace(/(\d)\(/g, '$1*(');
        // Implizite Multiplikation nach Klammern: (2)5 -> (2)*5
        expression = expression.replace(/\)(\d)/g, ')*$1');
        // Implizite Multiplikation zwischen Klammern: (2)(2) -> (2)*(2)
        expression = expression.replace(/\)\(/g, ')*(');

        // Prozentrechnung: 50% -> (50/100)
        expression = expression.replace(/(\d+(\.\d+)?)%/g, '($1/100)');

        // 4. Sicherheits-Check (Whitelisting)
        // Erlaubt Zahlen, Operatoren, Klammern und die Math-Objekt-Funktionen
        const allowedChars = /^[0-9+\-*/().\s**Math.sqrtPI]+$/;
        if (!allowedChars.test(expression)) {
            return "Ungültige Zeichen";
        }

        // 5. Berechnung
        // Wir nutzen Function statt eval, das ist minimal sicherer in Node.js Umgebungen
        let result = new Function(`return ${expression}`)();

        // 6. Validierung des Ergebnisses
        if (result === undefined || result === null || isNaN(result) || !isFinite(result)) {
            return "Nicht berechenbar";
        }

        // 7. Runden auf 10 Stellen, um Floating-Point Fehler (0.1 + 0.2) zu vermeiden
        return round(result, 10);

    } catch (error) {
        return "Syntax Fehler";
    }
}

// Hilfsfunktion zum Runden
function round(number, precision) {
    const factor = Math.pow(10, precision);
    return Math.round(number * factor) / factor;
}

// Node.js Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { calculate };
}

// --- ERWEITERTE TESTS ---
console.log("Standard: 2+2*3 = " + calculate("2+2*3"));           // 8
console.log("Klammern: (2+3)(4+5) = " + calculate("(2+3)(4+5)")); // 45
console.log("Potenz: 2^3 = " + calculate("2^3"));                 // 8
console.log("Wurzel: sqrt(16) = " + calculate("sqrt(16)"));       // 4
console.log("Prozent: 50% von 200 = " + calculate("200 * 50%"));  // 100
console.log("Konstante: pi * 2 = " + calculate("pi * 2"));        // 6.2831853072
console.log("Komma: 0,5 + 0,5 = " + calculate("0,5 + 0,5"));      // 1