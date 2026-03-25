/**
 * QUALITY-METRICS ENGINE - Premium Version
 * Berechnet Relevanz und Qualität für optimale Suchergebnisse
 *
 * SCORING:
 * - Keyword Match    (40%): Relevanz zu Query
 * - Phrase & Nähe   (NEU): Exakter Phrasen-Treffer + Proximity-Bonus
 * - Content Depth   (15%): Ausführlichkeit
 * - Readability     (15%): Lesbarkeit & Verständlichkeit
 * - Engagement      (15%): CTR, Dwell Time, Comments
 * - Structure       (10%): Tables, Steps, Multimedia
 * - Intent Match     (5%): News vs. Commerce vs. Info
 *
 * ─── NEU: PHRASE-MATCHING & NÄHE-SCORE ──────────────────────────────────────
 *
 *  PROBLEM VORHER:
 *  "günstige hotels münchen" → Seite mit "günstige" in Absatz 1 und
 *  "hotels münchen" in Absatz 8 bekam genauso viele Punkte wie eine Seite
 *  die "günstige hotels münchen" exakt im Titel hat.
 *
 *  LÖSUNG:
 *  Exakter Phrasentreffer im Titel       → +15 Punkte
 *  Exakter Phrasentreffer im Content     → +10 Punkte
 *  Alle Begriffe im gleichen Satz        → +8 Punkte
 *  Alle Begriffe innerhalb 150 Zeichen   → +4 Punkte
 *  Alle Begriffe irgendwo auf der Seite  → +0 Extra (kein Abzug)
 *  Begriffe weit auseinander             → −3 Punkte (Streuung-Malus)
 */

'use strict';

module.exports = {
    calculateRelevanceScore: function(item, query, context = {}) {
        const q = query.toLowerCase().trim();
        const DEBUG_QM = process.env.DEBUG_QUALITY_METRICS === 'true';

        // Häufige deutsche (und englische) Stop-Wörter herausfiltern
        const STOP_WORDS = new Set([
            'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'und', 'oder',
            'auf', 'aus', 'bei', 'bis', 'für', 'mit', 'nach', 'von', 'vor', 'zum',
            'zur', 'ins', 'ans', 'vom', 'hat', 'ist', 'sind', 'war', 'wird',
            'ich', 'wir', 'sie', 'ihr', 'man', 'sich', 'aber', 'auch', 'als',
            'wie', 'was', 'wer', 'dass', 'wenn', 'noch', 'nur', 'sehr', 'hier',
            'the', 'and', 'for', 'not', 'are', 'this', 'that', 'with', 'from'
        ]);

        const terms = q.split(/\s+/).filter(t => t.length > 2 && !STOP_WORDS.has(t));

        let relevanceScore = 0;
        const factors = {};

        // Intent am Anfang definieren
        const detectedIntent = this.detectSearchIntent(query);

        const title   = (item.title   || '').toLowerCase();
        const content = (item.content || '').toLowerCase();
        const url     = (item.url     || '').toLowerCase();

        // ════════════════════════════════════════════════════════════════════
        // 1. KEYWORD RELEVANCE (max 40 Punkte)
        // ════════════════════════════════════════════════════════════════════

        let keywordScore = 0;
        let termsFound   = 0;

        const coreTerms  = terms.filter(t => t.length > 3);
        let relevanceCap = 100;

        terms.forEach(term => {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wbRe    = new RegExp(`\\b${escaped}\\b`, 'i');
            let found     = false;

            if (wbRe.test(title))                                                    { keywordScore += 20; found = true; }
            // URL-Match entfernt: "autoscout24.de" enthält "auto" im Domain-Namen
            // aber das ist kein inhaltliches Relevanz-Signal → würde falsche Treffer boosten

            const contentCount = (content.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || []).length;
            if (contentCount >= 2)                                                   { keywordScore +=  5; found = true; }

            if (found && term.length > 3) termsFound++;
        });

        // Match-Ratio: Wenn ein Hauptbegriff komplett fehlt → starker Abzug
        const matchRatio = termsFound / (coreTerms.length || 1);
        if (matchRatio < 1.0) {
            keywordScore *= 0.1;
        }

        // IT-Context-Check (vorhandene Logik beibehalten)
        const itKeywords = ['software', 'programm', 'scratch', 'python', 'java', 'algorithmus', 'computer', 'digital'];
        const isItQuery  = terms.some(t => /coding|programm|informatik|scratch/i.test(t));
        const hasItContent = itKeywords.some(kw => content.toLowerCase().includes(kw));

        if (isItQuery && !hasItContent) {
            keywordScore -= 30;
            relevanceCap  = 20;
        }

        keywordScore = Math.min(Math.max(keywordScore, 0), 40);
        relevanceScore += keywordScore;
        factors.keyword = Math.round(keywordScore);

        // ════════════════════════════════════════════════════════════════════
        // 2. PHRASE-MATCHING & NÄHE-SCORE (max +15 Punkte, min -3 Punkte)
        //
        // Nur bei Multi-Word-Queries sinnvoll (mindestens 2 bedeutsame Terme)
        // ════════════════════════════════════════════════════════════════════

        let phraseScore = 0;

        if (terms.length >= 2) {
            phraseScore = this._calculatePhraseScore(q, terms, title, content);
            if (phraseScore !== 0 && DEBUG_QM) {
                console.log(`   [Phrase-Score] "${q}" → ${item.url?.slice(0, 50)} = ${phraseScore > 0 ? '+' : ''}${phraseScore}`);
            }
            relevanceScore += phraseScore;
        }

        factors.phrase = phraseScore;

        // ════════════════════════════════════════════════════════════════════
        // 3. CONTENT DEPTH (max 15 Punkte)
        // ════════════════════════════════════════════════════════════════════

        let depthScore  = 0;
        const wordCount = item.wordCount || 0;

        if      (wordCount > 2000) depthScore = 15;
        else if (wordCount > 1000) depthScore = 12;
        else if (wordCount > 500)  depthScore =  8;
        else if (wordCount > 200)  depthScore =  4;

        relevanceScore  += depthScore;
        factors.depth    = depthScore;

        // ════════════════════════════════════════════════════════════════════
        // 4. FRESHNESS (max 15 Punkte)
        // ════════════════════════════════════════════════════════════════════

        let freshnessScore = 0;
        const pubDate      = item.publishedDate || item.sitemapDate;

        if (pubDate) {
            const ageDays = (Date.now() - new Date(pubDate).getTime()) / (1000 * 60 * 60 * 24);

            if      (ageDays <=   1) freshnessScore = 15;
            else if (ageDays <=   3) freshnessScore = 14;
            else if (ageDays <=   7) freshnessScore = 12;
            else if (ageDays <=  30) freshnessScore =  9;
            else if (ageDays <= 180) freshnessScore =  5;
            else if (ageDays <= 365) freshnessScore =  2;
            else                     freshnessScore =  0;

            if (detectedIntent === 'NEWS' && ageDays <= 3) {
                freshnessScore = Math.min(15, freshnessScore + 3);
            }
        } else {
            freshnessScore = 7;
        }

        relevanceScore   += freshnessScore;
        factors.freshness = Math.round(freshnessScore);

        // ════════════════════════════════════════════════════════════════════
        // 5. READABILITY (max 10 Punkte)
        // ════════════════════════════════════════════════════════════════════

        let readabilityScore = 0;

        if      (item.readabilityScore >= 70) readabilityScore = 15;
        else if (item.readabilityScore >= 50) readabilityScore = 12;
        else if (item.readabilityScore >= 30) readabilityScore =  7;

        if (item.avgWordLength >= 3 && item.avgWordLength <= 8)      readabilityScore += 3;
        if (item.avgSentenceLength >= 8 && item.avgSentenceLength <= 15) readabilityScore += 2;

        readabilityScore    = Math.min(readabilityScore, 10);
        relevanceScore     += readabilityScore;
        factors.readability = Math.round(readabilityScore);

        // ════════════════════════════════════════════════════════════════════
        // 6. ENGAGEMENT SIGNALS (max 10 Punkte)
        // ════════════════════════════════════════════════════════════════════

        let engagementScore = 0;

        if      (item.ctr >= 8) engagementScore += 6;
        else if (item.ctr >= 5) engagementScore += 4;
        else if (item.ctr >= 2) engagementScore += 2;

        if      (item.dwellTime >= 3000) engagementScore += 5;
        else if (item.dwellTime >= 1500) engagementScore += 3;
        else if (item.dwellTime >=  500) engagementScore += 1;

        if      (item.commentCount >  50) engagementScore += 4;
        else if (item.commentCount >  10) engagementScore += 2;

        engagementScore    = Math.min(engagementScore, 10);
        relevanceScore    += engagementScore;
        factors.engagement = Math.round(engagementScore);

        // ════════════════════════════════════════════════════════════════════
        // 7. CONTENT STRUCTURE (max 7 Punkte)
        // ════════════════════════════════════════════════════════════════════

        let structureScore = 0;

        if (item.hasTable)  structureScore += 4;
        if (item.hasSteps)  structureScore += 4;
        if (item.imageCount >= 5)  structureScore += 3;
        if (item.videoCount  >  0) structureScore += 3;
        if (item.internalLinkDensity >= 0.1) structureScore += 2;

        structureScore    = Math.min(structureScore, 7);
        relevanceScore   += structureScore;
        factors.structure = Math.round(structureScore);

        // ════════════════════════════════════════════════════════════════════
        // 8. SEARCH INTENT MATCHING (max 3 Punkte)
        // ════════════════════════════════════════════════════════════════════

        let intentScore = 0;

        if (detectedIntent === 'INFORMATIONAL' && (item.category === 'news' || wordCount > 1000)) intentScore = 5;
        if (detectedIntent === 'COMMERCIAL' && (item.category === 'shop' || /preis|kaufen|bestellen|angebot/i.test(content))) intentScore = 5;
        if (detectedIntent === 'NEWS' && item.category === 'news') intentScore = 5;

        intentScore      = Math.min(intentScore, 3);
        relevanceScore  += intentScore;
        factors.intent   = intentScore;

        const finalScore = Math.round(Math.min(relevanceScore, relevanceCap));
        if (DEBUG_QM) {
            console.log(`   [QualityMetrics] "${item.url?.slice(0, 40)}" | Score: ${finalScore} | Komponenten: Keyword(${factors.keyword}) Phrase(${factors.phrase}) Depth(${factors.depth})`);
        }

        return {
            relevanceScore:   finalScore,
            factors,
            searchIntent:     detectedIntent,
            reasonsForRanking: this.getReasons(factors, item)
        };
    },

    // ══════════════════════════════════════════════════════════════════════════
    // PHRASE-MATCHING & NÄHE-SCORE (interne Hilfsfunktion)
    //
    // Gibt einen Wert zwischen -3 und +15 zurück.
    //
    // Stufen:
    //   +15  Exakter Phrasentreffer im Titel       ("günstige hotels münchen" steht wörtlich)
    //   +10  Exakter Phrasentreffer im Content
    //   + 8  Alle Begriffe im gleichen Satz
    //   + 4  Alle Begriffe innerhalb von 150 Zeichen ("Nähe-Fenster")
    //   + 0  Alle Begriffe irgendwo auf der Seite (kein Extra)
    //   − 3  Begriffe sehr weit auseinander / teilweise nicht gefunden
    // ══════════════════════════════════════════════════════════════════════════
    _calculatePhraseScore: function(query, terms, title, content) {

        // ── 1. Exakter Phrasentreffer im Titel ──────────────────────────────
        // "günstige hotels münchen" steht komplett und in Reihenfolge im Titel
        if (title.includes(query)) {
            return 15;
        }

        // Teilphrasen im Titel prüfen: mindestens 2 aufeinanderfolgende Terme
        if (terms.length >= 3) {
            for (let i = 0; i <= terms.length - 2; i++) {
                const teilPhrase = terms.slice(i, i + 2).join(' ');
                if (title.includes(teilPhrase)) {
                    return 12; // Teilphrase im Titel
                }
            }
        }

        // ── 2. Exakter Phrasentreffer im Content ────────────────────────────
        if (content.includes(query)) {
            return 10;
        }

        // ── 3. Alle Terme im gleichen Satz ──────────────────────────────────
        // Sätze aufteilen (Punkt, Ausrufezeichen, Fragezeichen, Zeilenumbruch)
        const saetze = content.split(/[.!?\n]+/);
        for (const satz of saetze) {
            const alleImSatz = terms.every(term => {
                const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                return re.test(satz);
            });
            if (alleImSatz) {
                return 8;
            }
        }

        // Gleiche Prüfung für Titel
        const alleImTitel = terms.every(term => {
            const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return re.test(title);
        });
        if (alleImTitel) {
            return 8;
        }

        // ── 4. Alle Terme in einem 150-Zeichen-Fenster (Nähe-Check) ─────────
        // Sliding Window: Bewegt sich durch den Content und prüft ob alle
        // Terme innerhalb von 150 Zeichen vorkommen
        const NAEHE_FENSTER = 150;
        const contentLaenge = content.length;

        for (let start = 0; start < contentLaenge - NAEHE_FENSTER; start += 30) {
            const fenster = content.slice(start, start + NAEHE_FENSTER);
            const alleImFenster = terms.every(term => {
                const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                return re.test(fenster);
            });
            if (alleImFenster) {
                return 4;
            }
        }

        // ── 5. Terme gefunden, aber weit auseinander ────────────────────────
        // Prüfen ob alle Terme überhaupt gefunden wurden (content + title)
        const kombiniert = title + ' ' + content;
        const alleGefunden = terms.every(term => {
            const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return re.test(kombiniert);
        });

        if (alleGefunden) {
            return 0; // Alle vorhanden, aber weit auseinander → kein Bonus, kein Abzug
        }

        // ── 6. Terme fehlen oder sehr verstreut ─────────────────────────────
        return -3;
    },

    // ══════════════════════════════════════════════════════════════════════════
    // INTENT-ERKENNUNG (unverändert)
    // ══════════════════════════════════════════════════════════════════════════
    detectSearchIntent: function(query) {
        const q = query.toLowerCase();

        // ═══════════════════════════════════════════════════════════════════════════
        // HYBRID-ANSATZ: Regex-Fallback + Data-Driven Intent (wird später in ranking.js verfeinert)
        // 
        // Diese Funktion ist ein SCHNELLER FALLBACK falls keine Index-Daten verfügbar sind.
        // Das echte Intent-Detection passiert in ranking.js durch Analyse der tatsächlichen
        // Suchergebnisse aus dem Index.
        // ═══════════════════════════════════════════════════════════════════════════

        // EXPLIZITE NEWS-INDIKATOREN (nur wenn SEHR eindeutig)
        if (/nachrichten|news|breaking|aktuell|heute|meldung|bericht|ereignis|incident|fall|schlagzeilen/i.test(q)) {
            return 'NEWS';
        }

        if (/^(was|wie|wer|warum|wo|wann)\s|definition|erklär|anleitung|guide|tutorial|how to|unterschied/i.test(q)) {
            return 'INFORMATIONAL';
        }
        if (/kaufen|buy|preis|price|kosten|bestellen|order|shop|angebot|vergleich|compare|hergestellt|hersteller/i.test(q)) {
            return 'COMMERCIAL';
        }
        if (/^www|\.com|\.de|\.org|site:|login|app/i.test(q)) {
            return 'NAVIGATION';
        }

        return 'GENERAL';
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 🆕 DATENGETRIEBENE INTENT-ERKENNUNG (real intelligence!)
    // 
    // Analysiert die Top Suchergebnisse und leitet Intent daraus ab.
    // Das ist echte Such-Engine-Intelligenz, nicht Regex-Zauberei!
    // ═══════════════════════════════════════════════════════════════════════════
    detectIntentFromResults: function(results, initialIntent) {
        if (!results || results.length < 3) {
            return initialIntent; // Zu wenig Daten, nutze Fallback
        }

        // Analysiere die Top 5 Ergebnisse
        const topResults = results.slice(0, 5);
        const categories = topResults.map(r => r.category || r.type || '').filter(Boolean);
        
        // Zähle Kategorien
        const categoryCount = {};
        categories.forEach(cat => {
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        });

        // Welche Kategorie dominiert?
        const [topCategory, count] = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])[0] || ['', 0];

        // 🎯 LOGIK: Wenn ≥3 von 5 Ergebnissen die gleiche Kategorie haben → das ist der Intent!
        if (count >= 3) {
            const categoryToIntent = {
                'news': 'NEWS',
                'article-news': 'NEWS',
                'blog': 'INFORMATIONAL',
                'tutorial': 'INFORMATIONAL',
                'guide': 'INFORMATIONAL',
                'product': 'COMMERCIAL',
                'shop': 'COMMERCIAL',
                'ecommerce': 'COMMERCIAL',
                'video': 'GENERAL',
                'forum': 'GENERAL',
            };
            
            const mappedIntent = categoryToIntent[topCategory.toLowerCase()];
            if (mappedIntent) {
                return mappedIntent;
            }
        }

        // Fallback: Nutze den initialen Regex-Intent
        return initialIntent;
    },

    // ══════════════════════════════════════════════════════════════════════════
    // RANKING-BEGRÜNDUNGEN (unverändert)
    // ══════════════════════════════════════════════════════════════════════════
    getReasons: function(factors, item = {}) {
        const reasons = [];

        if (factors.keyword  > 20) reasons.push('Relevant');
        if (factors.phrase   > 8)  reasons.push('Exakter Treffer');
        if (factors.phrase   > 4)  reasons.push('Thematisch passend');
        if (factors.depth    > 10) reasons.push('Ausführlich');
        if (factors.readability > 10) reasons.push('Lesbar');
        if (factors.engagement  >  8) reasons.push('Popular');
        if (factors.structure   >  5) reasons.push('Strukturiert');
        if (item.imageCount > 3)   reasons.push('Multimedia');

        return reasons.slice(0, 3);
    }
};