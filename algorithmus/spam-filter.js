/**
 * SPAM-DETECTION ENGINE - Premium Version
 * Filtert Spam, Fake-Seiten und minderwertige Websites systematisch
 * 
 * SPAM-LEVELS:
 * - CRITICAL (Score > 80): Hard block - wird NICHT angezeigt
 * - HIGH (Score 50-80): Blockiert bei niedrigem Trust
 * - MEDIUM (Score 20-50): Wird gekennzeichnet
 * - SAFE (Score < 20): Hochwertiger Content
 */

module.exports = {
    analyzeItem: function(item) {
        if (!item) return { isSpam: false, spamScore: 0, spamLevel: 'SAFE' };

        const DEBUG = process.env.DEBUG_SPAM_FILTER === 'true';
        let spamScore = 0;
        let spamReasons = [];
        let penalties = {};

        if (DEBUG) {
            console.log(`   [SpamFilter] analyzeItem() | URL: ${item.url?.slice(0, 50)}`);
        }

        // ============================================
        // HARD BLOCKERS - Automatische Blockade
        // ============================================

        // 0. ERROR-PAGES - Fehlerseiten sofort blockieren
        const errorTitlePatterns = /^(error|404|not found|page not found|fehler|seite nicht gefunden|403|forbidden|500|bad gateway|service unavailable)/i;
        const titleToCheck = (item.title || '').trim();
        if (errorTitlePatterns.test(titleToCheck)) {
            spamScore += 100;
            spamReasons.push('Error-Page (Titel: ' + titleToCheck.slice(0,40) + ')');
            penalties.errorPage = 100;
        }

        // ============================================
        // URL-TYP-ERKENNUNG (strukturelle Mustererkennung)
        // ============================================
        const urlStr = (item.url || '').toLowerCase();

        // HARD BLOCK: Sitemaps
        if (/\/sitemap|\/sitemap\.xml|\/sitemap\.html/i.test(urlStr)) {
            spamScore += 100;
            spamReasons.push('Sitemap-URL (kein Inhalt)');
            penalties.sitemapUrl = 100;
        }

        // HARD BLOCK: Suchergebnisseiten
        if (/[?&](q|query|search|s|suche)=/i.test(urlStr)) {
            spamScore += 100;
            spamReasons.push('Suchergebnisseite');
            penalties.searchUrl = 100;
        }

        // HARD BLOCK: Login/Legal/Shop
        if (/\/login|\/signin|\/register|\/cookie-policy|\/datenschutz|\/agb|\/impressum|\/privacy-policy|\/checkout|\/warenkorb/i.test(urlStr)) {
            spamScore += 80;
            spamReasons.push('Login/Legal/Shop-Prozessseite');
            penalties.legalPage = 80;
        }

        // PENALTY: Forum-Tag/Kategorie-Aggregatoren (geschützt vor qualityBonus)
        if (/\/tag\/|\/tags\/|\/thema\/|\/themen\/|\/kategorie\/|\/category\/|\/topics?\/|\/rubrik\//i.test(urlStr)) {
            spamScore += 80;
            spamReasons.push('Tag/Kategorie-Aggregator');
            penalties.tagPage = 80;
        }

        // PENALTY: Archiv/Übersichtsseiten
        if (/\/archiv\/|\/archive\/|\/alle-artikel|\/overview/i.test(urlStr)) {
            spamScore += 30;
            spamReasons.push('Archiv/Übersichtsseite');
            penalties.archivePage = 30;
        }

                // 1. ZU VIELE ADS (Monetarisierung über Qualität)
        if (item.adCount >= 20) {
            spamScore += 40;
            spamReasons.push(`Zu viele Ads (${item.adCount})`);
            penalties.ads = 40;
        } else if (item.adCount >= 10) {
            spamScore += 15;
            spamReasons.push(`Viele Ads (${item.adCount})`);
            penalties.ads = 15;
        }

        // 1b. ZU VIELE WERBEURLS - NEUE FEATURE (Ab 5 Werbeurls Abwertung - NUR STRAFEN)
        if (item.adUrlCount !== undefined && item.adUrlCount >= 5) {
            // Berechne Strafe basierend auf Anzahl der Werbeurls über 5
            const adUrlPenalty = Math.min(50, (item.adUrlCount - 5) * 5);
            spamScore += adUrlPenalty;
            spamReasons.push(`${item.adUrlCount} Werbeurls erkannt (Strafe: ${adUrlPenalty} Punkte)`);
            penalties.adUrls = adUrlPenalty;
        }

        // 2. DOMAIN TRUST zu niedrig
        if (item.domainTrust !== undefined && item.domainTrust < 0.15) {
            spamScore += 45;
            spamReasons.push(`Domain Trust zu niedrig (${(item.domainTrust * 100).toFixed(0)}%)`);
            penalties.trust = 45;
        } else if (item.domainTrust !== undefined && item.domainTrust < 0.3) {
            spamScore += 25;
            penalties.trust = 25;
        }

        // 3. CONTENT ZU DÜNN (< 300 Wörter = thin content)
        const wordCount = item.wordCount || (item.content ? item.content.split(/\s+/).length : 0);
        if (wordCount < 50) {
            spamScore += 35;
            spamReasons.push(`Zu wenig Content (${wordCount} < 50 Wörter)`);
            penalties.contentLength = 35;
        } else if (wordCount < 150) {
            spamScore += 10;
            spamReasons.push(`Wenig Content (${wordCount} Wörter)`);
            penalties.contentLength = 10;
        }

        // 4. SCHLECHTE LESBARKEIT
        if (item.readabilityScore !== undefined && item.readabilityScore < 30) {
            spamScore += 40;
            spamReasons.push(`Unlesbar (Score: ${item.readabilityScore}/100)`);
            penalties.readability = 40;
        }

        // 5. DOMAIN ZU NEU (< 6 Monate = verdächtig)
        if (item.domainAge !== undefined && item.domainAge < 1) {
            spamScore += 50;
            spamReasons.push(`Sehr neue Domain (< 6 Monate)`);
            penalties.newDomain = 50;
        }

        // ============================================
        // GEFÄHRLICHE QUALITÄTS-SIGNALE
        // ============================================

        // 6. KEINE E-A-T (Expertise, Authority, Trust)
        if (item.eatScore !== undefined && item.eatScore < 20) {
            spamScore += 30;
            spamReasons.push(`Keine E-A-T Signale (${item.eatScore}/100)`);
            penalties.eatScore = 30;
        }

        // 7. SCHLECHTE EXTERNE LINKS
        if (item.outboundQuality === false) {
            spamScore += 35;
            spamReasons.push(`Schlechte externe Verlinkungen`);
            penalties.badLinks = 35;
        }

        // 8. KEINE HTTPS (Sicherheit)
        if (item.isSecure === false) {
            spamScore += 25;
            spamReasons.push(`Keine HTTPS Verschlüsselung`);
            penalties.noHttps = 25;
        }

        // 9. NICHT MOBILE-FREUNDLICH
        if (item.isMobileFriendly === false) {
            spamScore += 15;
            spamReasons.push(`Nicht mobil-optimiert`);
            penalties.notMobile = 15;
        }

        // 9b. SEHR LANGSAME LADEZEIT - nur bei wirklich extremen Werten bestrafen
        // Crawl-Ladezeiten sind oft unzuverlässig (Server-Last, Netzwerk)
        const pageMs = item.loadSpeed || item.loadTime || 0;
        if (pageMs > 120000) {
            spamScore += 20;
            spamReasons.push(`Extrem langsame Ladezeit (${pageMs}ms)`);
            penalties.slowLoad = 20;
        } else if (pageMs > 60000) {
            spamScore += 5;
            penalties.slowLoad = 5;
        }

        // ============================================
        // CONTENT-ANALYSE SPAM-PATTERN
        // ============================================

        // 10. UNNATÜRLICHE WORTLÄNGE
        if (item.avgWordLength !== undefined) {
            if (item.avgWordLength < 2.5 || item.avgWordLength > 18) {
                spamScore += 20;
                spamReasons.push(`Unnatürliche Wortlänge (${item.avgWordLength.toFixed(1)})`);
                penalties.wordLength = 20;
            }
        }

        // 11. ZU KURZE SÄTZE (Roboterhaft)
        if (item.avgSentenceLength !== undefined && item.avgSentenceLength < 3) {
            spamScore += 15;
            spamReasons.push(`Sätze zu kurz (${item.avgSentenceLength.toFixed(1)} Wörter)`);
            penalties.sentenceLength = 15;
        }

        // 12. KEYWORD STUFFING (zu häufige Wiederholungen)
        if (item.content && item.title) {
            const words = item.content.toLowerCase().split(/\s+/);
            const uniqueWords = new Set(words.filter(w => w.length > 3));
            const diversity = uniqueWords.size / words.length;
            
            if (diversity < 0.4 && words.length > 100) {
                spamScore += 25;
                spamReasons.push(`Keyword Stuffing (Diversity: ${(diversity * 100).toFixed(0)}%)`);
                penalties.keywordStuffing = 25;
            }
        }

        // 13. TEXT-ZU-CODE VERHÄLTNIS zu niedrig
        if (item.textToCodeRatio !== undefined && item.textToCodeRatio < 0.1) {
            spamScore += 20;
            spamReasons.push(`Zu viel Code (${(item.textToCodeRatio * 100).toFixed(1)}%)`);
            penalties.textRatio = 20;
        }

        // 14. GERINGE INTERNE LINK-STRUKTUR
        if (item.internalLinkDensity !== undefined && item.internalLinkDensity < 0.05) {
            spamScore += 10;
            penalties.internalLinks = 10;
        }

        // ============================================
        // QUALITÄTS-BONUS (Reduziert Score)
        // ============================================

        let qualityBonus = 0;

        if (item.hasTable) qualityBonus -= 15;
        if (item.hasSteps) qualityBonus -= 20;
        if (item.imageCount && item.imageCount >= 3) qualityBonus -= 15;
        if (item.videoCount && item.videoCount > 0) qualityBonus -= 15;
        if (item.commentCount && item.commentCount > 5) qualityBonus -= 10;
        if (item.textToCodeRatio && item.textToCodeRatio > 0.6) qualityBonus -= 10;

        // URL-Penalties sind GESCHÜTZT: qualityBonus darf sie nicht neutralisieren
        const urlPenaltyTotal = (penalties.tagPage || 0) + (penalties.sitemapUrl || 0) +
            (penalties.searchUrl || 0) + (penalties.legalPage || 0) + (penalties.archivePage || 0);
        const baseScore = spamScore - urlPenaltyTotal;
        spamScore = Math.max(0, baseScore + qualityBonus) + urlPenaltyTotal;

        // ============================================
        // FINALE KLASSIFIZIERUNG
        // ============================================

        let spamLevel = 'SAFE';
        let isSpam = false;

        if (spamScore >= 80) {
            spamLevel = 'CRITICAL';
            isSpam = true;
        } else if (spamScore >= 50) {
            spamLevel = 'HIGH';
            // High Spam + niedriger Trust = auto-block
            if (item.domainTrust && item.domainTrust < 0.3) {
                isSpam = true;
            }
        } else if (spamScore >= 20) {
            spamLevel = 'MEDIUM';
        }

        // DEBUG: Log final spam score and reasons
        if (isSpam) {
            console.log(`  ➜ SPAM SCORE: ${Math.min(100, spamScore)} (${spamLevel}) | Reasons: ${spamReasons.join(', ')}`);
        }

        return {
            isSpam,
            spamScore: Math.min(100, spamScore),
            spamLevel,
            spamReasons,
            penalties,
            qualityBonus
        };
    },

    getSpamReason: function(analysis) {
        if (!analysis.spamReasons || analysis.spamReasons.length === 0) return null;
        return analysis.spamReasons.join(' | ');
    }
};