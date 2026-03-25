/**
 * Result List
 * Pfad: navigations_tabs/widgets/result-list.js
 */

import { fetchAllDomainRatings, fetchPaywallCounts, getRatingBadge } from './rating-utils.js';

function escAttr(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export async function renderResultList(normalData, widgetUrls, relatedSearches) {
    const listData = normalData
        .filter(item => !item.isBestMatch && !item.isFact && !widgetUrls.has(item.url))
        .slice(0, 10);

    if (listData.length === 0) return '';

    const domainList = listData.map(item => {
        try {
            let d = new URL(item.url).hostname || '';
            if (d.includes(':')) d = d.split(':')[0];
            return d.replace(/^www\./, '').toLowerCase();
        } catch { return ''; }
    });

    // ── Zusammenfassungen prüfen (exakte URL) ────────────────────────────────
    let urlsWithSummarySet = new Set();
    try {
        const allVariants = [];
        listData.forEach(i => {
            allVariants.push(encodeURIComponent(i.url));
            if (i.url.includes('://www.'))
                allVariants.push(encodeURIComponent(i.url.replace('://www.', '://')));
            else
                allVariants.push(encodeURIComponent(i.url.replace('://', '://www.')));
        });
        if (allVariants.length > 0) {
            const factsRes = await fetch(`/api/facts?urls=${allVariants.join(',')}`);
            const factsData = await factsRes.json();
            factsData
                .filter(f => f.kategorie === '_zusammenfassung' && f.url)
                .forEach(f => {
                    urlsWithSummarySet.add(f.url);
                    urlsWithSummarySet.add(f.url.replace('://www.', '://'));
                    urlsWithSummarySet.add(f.url.replace('://', '://www.'));
                });
        }
    } catch(e) {}

    // ── Ähnlichkeits-Daten laden ─────────────────────────────────────────────
    let similarityMap = {};
    try {
        const urlParams = listData.map(i => encodeURIComponent(i.url)).join(',');
        const simRes = await fetch(`/api/similarity?urls=${urlParams}`);
        similarityMap = await simRes.json();
    } catch(e) {}

    const [getRating, paywallCounts] = await Promise.all([
        fetchAllDomainRatings(domainList),
        fetchPaywallCounts(listData.map(i => i.url))
    ]);

    const itemsWithRatings = listData.map((item, i) => ({
        item,
        domain: domainList[i],
        rating: getRating(domainList[i]),
        paywallCount: paywallCounts[item.url] || 0,
        hasSummary: urlsWithSummarySet.has(item.url)
    }));

    function formatVoteCount(num) {
        if (!num) return '0';
        if (num >= 1000000) return (num / 1000000).toFixed(1).replace('.0','') + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1).replace('.0','') + 'K';
        return num.toString();
    }

    let html = itemsWithRatings.map(({ item, domain, rating, paywallCount, hasSummary }, idx) => {
        const faviconUrl = domain ? `https://www.google.com/s2/favicons?sz=48&domain=${domain}` : '';

        const paywallBadge = paywallCount >= 5
            ? `<span class="luma-rating-badge" style="margin-left:8px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;white-space:nowrap;flex-shrink:0;color:#ff9800;background:rgba(255,152,0,0.15);border:1px solid rgba(255,152,0,0.3);cursor:help;" title="${paywallCount} Nutzer haben eine Paywall gemeldet">€ Abo</span>`
            : '';

        let dbPaywallMark = '';
        if (item.isPaywall || item.ist_paywall || item.hasPaywall) {
            if (item.hasPaywall && !item.isPaywall && !item.ist_paywall) {
                // Paywall von Ranking-Algorithmus erkannt
                dbPaywallMark = `<span style="margin-left:6px;font-size:14px;font-weight:700;color:#ff9800;cursor:help;" title="🔒 Paywall erkannt">€</span>`;
            } else {
                // Paywall von Paywall-Radar erkannt
                const confidence = item.paywall_confidence || item.paywallConfidence || 0;
                const typ = item.paywall_typ || item.paywallTyp || 'unknown';
                const grund = item.paywall_grund || item.paywallGrund || 'Paywall erkannt';
                const confidencePercent = Math.round(confidence * 100);
                const typeLabel = {'json-ld':'JSON-LD Schema','meta-tag':'Meta-Tag','html-selector':'HTML-Element','text-pattern':'Text-Muster','structural':'Struktur-Analyse','none':'Keine Paywall'}[typ] || typ;
                dbPaywallMark = `<span style="margin-left:6px;font-size:14px;font-weight:700;color:#ff9800;cursor:help;" title="🔒 Paywall erkannt (${confidencePercent}%)&#10;Typ: ${typeLabel}&#10;Grund: ${grund}">€</span>`;
            }
        }

        const { positive = 0, negative = 0 } = rating;
        const positiveNum = parseInt(positive) || 0;
        const negativeNum = parseInt(negative) || 0;

        let displayUrl = item.url;
        try { displayUrl = new URL(item.url).origin; } catch(e) {}

        const summaryBtn = hasSummary ? (() => {
            const sid = `sum-${idx}-${Date.now()}`;
            const enc = escAttr(JSON.stringify([{url: item.url, title: item.title||''}]));
            return `<button onclick="window.loadSingleArticleSummary(this,'${sid}')" data-urls="${enc}" style="background:rgba(138,180,248,0.08);border:1px solid rgba(138,180,248,0.25);color:#8ab4f8;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;" onmouseover="this.style.background='rgba(138,180,248,0.18)'" onmouseout="this.style.background='rgba(138,180,248,0.08)'"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>Zusammenfassung</button><div id="${sid}" style="display:none;margin-top:8px;padding:12px 16px;background:rgba(138,180,248,0.05);border:1px solid rgba(138,180,248,0.15);border-radius:8px;font-size:13px;color:#bdc1c6;line-height:1.6;"></div>`;
        })() : '';

        // ── Similarity Badge ─────────────────────────────────────────────────
        const simData = similarityMap[item.url] || null;
        const similarityBadge = (() => {
            if (!simData || (simData.duplicateCount === 0 && (!simData.widersprueche || simData.widersprueche.length === 0))) return '';

            const { 
                originality = 100, 
                duplicateCount = 0, 
                isOriginal = true, 
                originalUrl = null, 
                originalQuelle = null, 
                similarUrls = [], 
                widersprueche = [] 
            } = simData;
            
            // Kein Originalquelle-Badge wenn nur Widersprüche vorhanden (keine Duplikate)
            const hatDuplikate = duplicateCount > 0 && similarUrls.length > 0;
            const popupId = `sim-popup-${idx}`;

            // Popup wird weiter unten gebaut

            // Popup mit CSS-Klassen (wie ctx-menu)
            let popupHtml = `<div id="${popupId}" class="sim-popup">`;

            // ─── Ähnliche Artikel ───────────────────────────────────────
            if (hatDuplikate) {
                popupHtml += `<div class="sim-popup-title">${duplicateCount} ähnliche Artikel gefunden</div>`;
                similarUrls.forEach(s => {
                    let sh = ''; try { sh = new URL(s.url).hostname.replace('www.',''); } catch {}
                    const ic = s.originality >= 80 ? '✦' : '⚠';
                    const co = s.originality >= 80 ? '#4caf50' : '#f44336';
                    popupHtml += `<a href="${s.url}" target="_blank" class="sim-popup-item">
                        <span style="color:${co};flex-shrink:0;">${ic}</span>
                        <div>
                            <div>${s.titel || s.url}</div>
                            <div style="font-size:11px;color:var(--muted);margin-top:2px;">${sh} · ${s.originality}% original</div>
                        </div>
                    </a>`;
                });
                if (originalUrl) {
                    popupHtml += `<div class="sim-popup-footer">Möglicherweise zuerst bei: <a href="${originalUrl}" target="_blank" style="color:#8ab4f8;text-decoration:none;">${originalQuelle || originalUrl}</a></div>`;
                }
            }

            // ─── Widersprüche ─────────────────────────────────────────
            if (widersprueche.length > 0) {
                if (hatDuplikate) {
                    popupHtml += `<div style="border-top:1px solid var(--border); margin: 8px 0;"></div>`;
                }
                popupHtml += `<div class="sim-popup-title" style="color:#ff6b6b;">⚔️ ${widersprueche.length} Widerspruch${widersprueche.length !== 1 ? 'e' : ''} erkannt</div>`;
                widersprueche.forEach(w => {
                    // Typ-Label und Icon
                    const typIcon  = w.widerspruchTyp === 'faktisch'  ? '⚡' : w.widerspruchTyp === 'bewertung' ? '🎭' : '❓';
                    const typLabel = w.widerspruchTyp === 'faktisch'  ? 'Faktischer Widerspruch'
                                   : w.widerspruchTyp === 'bewertung' ? 'Bewertungs-Widerspruch'
                                   : 'Widerspruch';
                    // Konfidenz-Balken
                    const konfidenz = w.konfidenz || w.myScore || 0;
                    const konfBar   = Math.round(konfidenz / 10);
                    const konfColor = konfidenz >= 80 ? '#f44336' : konfidenz >= 65 ? '#ff9800' : '#888';

                    popupHtml += `<a href="${w.otherUrl}" target="_blank" class="sim-popup-item" style="background:rgba(255,107,107,0.05);border-color:rgba(255,107,107,0.2);text-decoration:none;display:block;padding:8px 10px;border-radius:6px;border:1px solid rgba(255,107,107,0.2);margin-bottom:4px;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                            <span style="font-size:13px;">${typIcon}</span>
                            <span style="color:#ff6b6b;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">${typLabel}</span>
                            <span style="margin-left:auto;font-size:10px;color:${konfColor};font-weight:600;">${konfidenz}% Konfidenz</span>
                        </div>
                        <div style="color:#e8eaed;font-weight:500;font-size:13px;margin-bottom:4px;line-height:1.3;">${w.otherTitle || w.otherDomain}</div>
                        <div style="font-size:11px;color:#9aa0a6;margin-bottom:4px;">${w.otherDomain}</div>
                        ${w.erklaerung ? `<div style="font-size:11px;color:#ff9999;font-style:italic;line-height:1.4;margin-bottom:4px;">"${w.erklaerung.substring(0, 120)}${w.erklaerung.length > 120 ? '…' : ''}"</div>` : ''}
                        <div style="font-size:10px;color:#666;margin-top:2px;">🏢 ${w.konzern}</div>
                    </a>`;
                });
            }

            if (popupHtml === `<div id="${popupId}" class="sim-popup">`) {
                return ''; // Keine Daten
            }

            popupHtml += '</div>';

            // onclick via globale window.toggleSimPopup Funktion (wie openResultMenu)

            if (widersprueche.length > 0) {
                // Wenn Widersprüche existieren, Badge rot machen
                return `<span style="position:relative;display:inline-flex;align-items:center;"><span onclick="event.stopPropagation();window.toggleSimPopup(this)" data-popup-id="${popupId}" style="display:inline-flex;align-items:center;gap:4px;background:rgba(255, 107, 107, 0.1);border:1px solid rgba(255, 107, 107, 0.3);color:#ff6b6b;font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;white-space:nowrap;cursor:pointer;">⚔️ Widerspruch ▾</span>${popupHtml}</span>`;
            } else if (hatDuplikate) {
                const color = isOriginal || originality >= 80 ? '#4caf50' : originality >= 50 ? '#ff9800' : '#f44336';
                const bg    = isOriginal || originality >= 80 ? 'rgba(76,175,80,0.1)' : originality >= 50 ? 'rgba(255,152,0,0.1)' : 'rgba(244,67,54,0.08)';
                const border= isOriginal || originality >= 80 ? 'rgba(76,175,80,0.3)' : originality >= 50 ? 'rgba(255,152,0,0.3)' : 'rgba(244,67,54,0.25)';
                const label = originality >= 80 ? `⎘ ${duplicateCount}× ähnlich ▾` : originality >= 50 ? `⚠ ${duplicateCount}× ähnlich ▾` : `⚠ ${duplicateCount}× kopiert ▾`;
                return `<span style="position:relative;display:inline-flex;align-items:center;"><span onclick="event.stopPropagation();window.toggleSimPopup(this)" data-popup-id="${popupId}" style="display:inline-flex;align-items:center;gap:4px;background:${bg};border:1px solid ${border};color:${color};font-size:10px;font-weight:600;padding:2px 7px;border-radius:10px;white-space:nowrap;cursor:pointer;">${label}</span>${popupHtml}</span>`;
            }

            return ''; // Keine Badge wenn keine Daten
        })();

        return `
        <div class="result-item" style="margin-bottom:32px;position:relative;">
            <div class="result-item-inner" style="max-width:100%;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;min-width:0;">
                    ${faviconUrl ? `<img src="${faviconUrl}" alt="" class="result-favicon">` : ''}
                    <a href="${item.url}" onclick="window.lumaTrackClick('${escAttr(item.url)}',${idx})" style="color:#8ab4f8;font-size:20px;text-decoration:none;font-weight:400;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;overflow-wrap:break-word;">
                        ${item.title}
                    </a>
                </div>
                <div class="result-source" style="color:#888898;font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:6px;min-width:0;overflow:visible;flex-wrap:wrap;">
                    <span style="text-overflow:ellipsis;overflow:hidden;white-space:nowrap;flex:1;min-width:0;">${displayUrl}${dbPaywallMark}</span>
                    ${getRatingBadge(item.votes || { approvalRating: null, totalVotes: 0 }, item, domain)}
                    ${paywallBadge}
                    ${similarityBadge}
                    ${summaryBtn}
                    <button class="result-more-btn"
                        data-url="${escAttr(item.url)}"
                        data-domain="${escAttr(domain)}"
                        data-rank-pos="${idx + 1}"
                        data-trust="${item.trustScore || item.trust_score || '–'}"
                        data-relevance="${item.relevanceScore || item.relevance_score || '–'}"
                        data-quality="${item.qualityScore || item.quality_score || '–'}"
                        data-spam="${item.spamScore || item.spam_score || '–'}"
                        data-trend="${item.trendBonus || item.trend_bonus || 0}"
                        data-approval-rating="${item.votes?.approvalRating || null}"
                        data-total-votes="${item.votes?.totalVotes || 0}"
                        data-is-trending="${item.isTrending || false}"
                        data-konzern="${escAttr(domain)}"
                        onclick="window.openResultMenu(this)"
                        title="Mehr Optionen" aria-label="Mehr Optionen">⋮</button>
                </div>
                <div style="color:#bdc1c6;font-size:14px;line-height:1.58;word-break:break-word;overflow-wrap:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">
                    ${item.content || item.contentSnippet || ''}
                </div>
            </div>
        </div>`;
    }).join('');

    // ── Verwandte Suchanfragen ────────────────────────────────────────────────
    if (relatedSearches && relatedSearches.length > 0) {
        html += `
        <div class="related-searches-section">
            <div class="related-searches-label">Ähnliche Suchanfragen</div>
            <div class="related-searches-container">
                ${relatedSearches.map(s => `
                    <a href="?q=${encodeURIComponent(s)}&tab=all&page=1" class="related-search-chip">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9aa0a6" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        ${s}
                    </a>
                `).join('')}
            </div>
        </div>`;
    }

    return html;
}