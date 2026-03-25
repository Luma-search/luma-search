/**
 * Rating Utils
 * Pfad: navigations_tabs/widgets/rating-utils.js
 * Vote-Cache, Domain-Ratings, Paywall-Counts, Rating-Badge
 */

const ratingCache = new Map();

export function clearVoteCache() {
    ratingCache.clear();
}

export async function fetchAllDomainRatings(domains) {
    const emptyVotes = { approvalRating: null, totalVotes: 0 };
    const uncached = [...new Set(domains)].filter(d => d && !ratingCache.has(d));

    if (uncached.length > 0) {
        try {
            const res = await fetch(`/api/votes?domains=${uncached.map(encodeURIComponent).join(',')}`);
            const data = await res.json();
            for (const [domain, votes] of Object.entries(data)) {
                const v = {
                    approvalRating: votes.approvalRating || null,
                    totalVotes: votes.totalVotes || 0
                };
                ratingCache.set(domain, v);
                setTimeout(() => ratingCache.delete(domain), 60 * 1000);
            }
        } catch {}
    }

    return domain => ratingCache.get(domain) || emptyVotes;
}

export async function fetchPaywallCounts(urls) {
    if (!urls.length) return {};
    try {
        const res = await fetch('/api/paywall/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls })
        });
        return await res.json();
    } catch { return {}; }
}

export function getRatingBadge(rating, item, domain) {
    const { approvalRating = null, totalVotes = 0 } = rating;

    const cv = item.votes || { approvalRating: null, totalVotes: 0 };
    const trustData = JSON.stringify({
        domain: domain,
        score: item.trustScore !== undefined ? Math.round(item.trustScore) : Math.round((item.domainTrust || 0) * 100),
        secure: item.isSecure,
        age: item.domainAge || 0,
        eat: item.eatScore || 0,
        approvalRating: approvalRating,
        totalVotes: totalVotes
    }).replace(/"/g, '&quot;');

    const commonStyle = 'margin-left: 10px; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; white-space: nowrap; flex-shrink: 0; cursor: pointer;';
    const clickAttr = `onclick="if(window.openTrustDetails) window.openTrustDetails(this)" data-trust="${trustData}"`;

    if (approvalRating === null || totalVotes === 0) {
        return `<span class="luma-rating-badge" ${clickAttr} style="${commonStyle} color: #888898; background: #88889810; border: 1px solid #88889840;" title="Noch keine Community-Abstimmungen – Klicken zum Reagieren">○ Neu</span>`;
    }

    // Farbcodierung basierend auf Approval-Rating
    let color;
    if (approvalRating >= 70) {
        color = '#4caf50'; // Grün – sehr positiv
    } else if (approvalRating >= 50) {
        color = '#ff9800'; // Orange – neutral bis leicht positiv
    } else {
        color = '#f44336'; // Rot – überwiegend negativ
    }

    const tooltip = `Community-Bewertung: ${approvalRating}% positiv (${totalVotes} Abstimmungen) – Klicken für Details`;
    return `<span class="luma-rating-badge" ${clickAttr} style="${commonStyle} color: ${color}; background: ${color}20; border: 1px solid ${color}40;" title="${tooltip}">👥 ${approvalRating}%</span>`;
}