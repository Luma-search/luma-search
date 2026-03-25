/**
 * LUMA KNOWLEDGE PANEL PRO
 * Nutzt Wikipedia für Texte/Bilder und Wikidata für echte Fakten.
 * Optimiert: Batch-Label-Requests, In-Memory-Cache, localStorage-Cache (TTL 1h), Timeout
 */

const _cache = new Map();
const KP_LS_PREFIX = 'luma_kp_';
const KP_LS_TTL    = 10 * 60 * 1000; // 10 Minuten (war 1 Stunde)

function _lsGet(key) {
    try {
        const raw = localStorage.getItem(KP_LS_PREFIX + key);
        if (!raw) return null;
        const { html, ts } = JSON.parse(raw);
        if (Date.now() - ts > KP_LS_TTL) {
            localStorage.removeItem(KP_LS_PREFIX + key);
            return null;
        }
        return html;
    } catch {
        return null;
    }
}

function _lsSet(key, html) {
    try {
        localStorage.setItem(KP_LS_PREFIX + key, JSON.stringify({ html, ts: Date.now() }));
    } catch {
        // localStorage voll oder nicht verfügbar → ignorieren
    }
}

export async function getKnowledgePanelHtml(item, query) {
    // Kein Panel bei Fragen oder vagen Begriffen
    const q = (query || '').trim();
    const isQuestion  = /^(was|wie|wer|warum|wo|wann|welche|welcher|welches|wieso|woher|wohin|gibt es|kann |ist es|sind |hat |haben |wurde |wird )/i.test(q);
    const isVague     = /^(einwohnerzahl|bevölkerung|fläche|höhe|tiefe|alter|preis|kosten|wert|liste|übersicht|vergleich|unterschied|bedeutung|definition|erklärung|geschichte|entwicklung|ursache|folgen|wirkung|größter|größster|größten|kleinster|kleinsten|höchster|höchsten|schnellster|längster|längsten|stärkster|reichster|tiefster|breitester|schwerster|leichtester|ältester|jüngster|bekanntester|beliebtester|wichtigster|gefährlichster)/i.test(q.split(' ')[0]);
    const isBlacklist = /^(nachrichten|news|wetter|sport|politik|wirtschaft|suche|bilder|videos|fragen|aktuell|heute|aktuelles)$/i.test(q);
    if (isQuestion || isVague || isBlacklist) return '';

    let searchTerm = query && query.trim() !== '' ? query : null;

    if (!searchTerm && item?.url?.includes('wikipedia.org/wiki/')) {
        try {
            const urlObj = new URL(item.url);
            const parts = urlObj.pathname.split('/wiki/');
            if (parts.length > 1) {
                searchTerm = decodeURIComponent(parts[1]).replace(/_/g, ' ');
            }
        } catch (e) {
            console.error("URL Parsing Error", e);
        }
    }

    if (!searchTerm) return '';

    // 1. In-Memory-Cache (schnellster Pfad)
    if (_cache.has(searchTerm)) return _cache.get(searchTerm);

    // 2. localStorage-Cache (überlebt Seiten-Neuladen, TTL: 1 Stunde)
    const lsHtml = _lsGet(searchTerm);
    if (lsHtml) {
        _cache.set(searchTerm, lsHtml);
        return lsHtml;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const signal = controller.signal;

    try {
        // 1. Wikipedia-Suche (verzeiht Tippfehler)
        const searchRes = await fetch(
            `https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&utf8=&format=json&origin=*`,
            { signal }
        );
        const searchData = await searchRes.json();

        if (!searchData.query?.search?.length) return '';

        const exactTitle = searchData.query.search[0].title;

        // 2. Wikipedia Summary (Text + Bild + Wikidata-ID)
        const wikiRes = await fetch(
            `https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(exactTitle.replace(/ /g, '_'))}`,
            { signal }
        );
        if (!wikiRes.ok) return '';
        const wikiData = await wikiRes.json();

        if (wikiData.type === 'disambiguation') return '';

        const title      = wikiData.title;
        const description = wikiData.extract;
        const image      = wikiData.thumbnail?.source ?? null;
        const pageUrl    = wikiData.content_urls?.desktop?.page
                        || `https://de.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
        const wikidataId = wikiData.wikibase_item;

        let facts = [];

        // 3. Wikidata für Fakten
        if (wikidataId) {
            const propMap = {
                P569:  'Geboren',
                P19:   'Geburtsort',
                P106:  'Beruf',
                P108:  'Arbeitgeber',
                P112:  'Gegründet von',
                P169:  'CEO',
                P571:  'Gründungsjahr',
                P159:  'Hauptsitz',
                P1830: 'Eigentümer von',
                P40:   'Kinder',
                P2218: 'Nettovermögen',
            };

            const wdRes = await fetch(
                `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}&languages=de&props=claims&format=json&origin=*`,
                { signal }
            );
            const wdData = await wdRes.json();

            if (wdData.entities?.[wikidataId]?.claims) {
                const claims = wdData.entities[wikidataId].claims;

                // Alle benötigten Entity-IDs in einem Durchlauf sammeln
                const entityIds = new Set();
                const rawFacts  = [];

                for (const [prop, label] of Object.entries(propMap)) {
                    // P39 (Amt): letzten Eintrag nehmen = aktuellstes Amt
                    // Alle anderen Props: ersten Eintrag (z.B. Geburtsdatum ändert sich nicht)
                    const claimList = claims[prop] || [];
                    const claimEntry = prop === 'P39'
                        ? claimList[claimList.length - 1]
                        : claimList[0];
                    const datavalue = claimEntry?.mainsnak?.datavalue;
                    if (!datavalue) continue;

                    if (datavalue.type === 'wikibase-entityid') {
                        const id = datavalue.value.id;
                        entityIds.add(id);
                        rawFacts.push({ label, type: 'entity', id });
                    } else if (datavalue.type === 'time') {
                        const timeStr   = datavalue.value.time.replace(/^\+/, '').split('T')[0];
                        const formatted = new Date(timeStr).toLocaleDateString('de-DE', {
                            day: 'numeric', month: 'long', year: 'numeric'
                        });
                        rawFacts.push({ label, type: 'direct', value: formatted });
                    } else if (datavalue.type === 'string') {
                        rawFacts.push({ label, type: 'direct', value: datavalue.value });
                    } else if (datavalue.type === 'quantity') {
                        const amount = Math.abs(parseFloat(datavalue.value.amount));
                        const unit = datavalue.value.unit || '';
                        let formatted = amount >= 1e9
                            ? (amount / 1e9).toLocaleString('de-DE', {maximumFractionDigits:1}) + ' Mrd. USD'
                            : amount >= 1e6
                            ? (amount / 1e6).toLocaleString('de-DE', {maximumFractionDigits:1}) + ' Mio. USD'
                            : amount.toLocaleString('de-DE');
                        rawFacts.push({ label, type: 'direct', value: formatted });
                    }
                }

                // EINZIGER Batch-Request für alle Entity-Labels (statt N Einzelrequests)
                const labelMap = {};
                if (entityIds.size > 0) {
                    try {
                        const labelsRes = await fetch(
                            `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${[...entityIds].join('|')}&languages=de|en&props=labels&format=json&origin=*`,
                            { signal }
                        );
                        const labelsData = await labelsRes.json();
                        for (const id of entityIds) {
                            const ent = labelsData.entities?.[id];
                            labelMap[id] = ent?.labels?.de?.value || ent?.labels?.en?.value || id;
                        }
                    } catch {
                        for (const id of entityIds) labelMap[id] = id;
                    }
                }

                // Facts in propMap-Reihenfolge aufbauen
                for (const raw of rawFacts) {
                    const value = raw.type === 'entity' ? labelMap[raw.id] : raw.value;
                    if (value) facts.push({ label: raw.label, value });
                }
            }
        }

        // 4. HTML zusammenbauen
        // CSS Styles direkt einbetten
        const styles = `
        <style>
            .luma-kp {
                background: #202124;
                border: 1px solid #3c4043;
                border-radius: 12px;
                overflow: hidden;
                font-family: 'Google Sans', 'Roboto', Arial, sans-serif;
                width: 100%; /* Füllt exakt die 480px Spalte aus */
                /* max-width entfernt, da die Spalte in alles.js das Limit setzt */
                margin-bottom: 20px;
                color: #e8eaed;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .luma-kp-img-wrapper {
                width: 100%;
                height: 220px;
                background: #000;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                position: relative;
                border-bottom: 1px solid #3c4043;
            }
            .luma-kp-img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.5s ease;
            }
            .luma-kp:hover .luma-kp-img { transform: scale(1.03); }
            .luma-kp-content { padding: 20px; }
            .luma-kp-title { margin: 0; font-size: 24px; font-weight: 500; line-height: 1.2; letter-spacing: -0.5px; }
            .luma-kp-subtitle { font-size: 12px; color: #9aa0a6; margin-top: 6px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
            .luma-kp-desc { font-size: 14px; line-height: 1.6; color: #bdc1c6; margin-bottom: 20px; }
            .luma-kp-facts { border-top: 1px solid #3c4043; padding-top: 16px; display: flex; flex-direction: column; gap: 10px; }
            .luma-kp-fact-row { display: flex; font-size: 13px; line-height: 1.4; }
            .luma-kp-fact-label { color: #9aa0a6; width: 110px; flex-shrink: 0; font-weight: 500; }
            .luma-kp-fact-val { color: #e8eaed; }
            .luma-kp-btn { display: block; background: #303134; border: 1px solid #3c4043; color: #8ab4f8; text-align: center; padding: 12px; border-radius: 100px; text-decoration: none; font-size: 14px; font-weight: 500; transition: all 0.2s; margin-top: 20px; }
            .luma-kp-btn:hover { background: rgba(138, 180, 248, 0.08); border-color: #5f6368; color: #aecbfa; }
        </style>
        `;

        const html = styles + `
            <div class="luma-kp">
                ${image ? `
                <div class="luma-kp-img-wrapper">
                    <img src="${image}" class="luma-kp-img" alt="${title}" loading="lazy">
                </div>
                ` : ''}

                <div class="luma-kp-content">
                    <h2 class="luma-kp-title">${title}</h2>
                    <div class="luma-kp-subtitle">Wikipedia Eintrag</div>

                    <div class="luma-kp-desc">${description}</div>

                    ${facts.length > 0 ? `
                    <div class="luma-kp-facts">
                        ${facts.map(f => `
                            <div class="luma-kp-fact-row">
                                <span class="luma-kp-fact-label">${f.label}</span>
                                <span class="luma-kp-fact-val">${f.value}</span>
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    <a href="${pageUrl}" target="_blank" class="luma-kp-btn">Mehr auf Wikipedia lesen</a>
                </div>
            </div>
        `;

        // Ergebnis in Memory + localStorage cachen
        if (_cache.size >= 200) _cache.delete(_cache.keys().next().value);
        _cache.set(searchTerm, html);
        _lsSet(searchTerm, html);

        return html;

    } catch (e) {
        if (e.name === 'AbortError') {
            console.warn('Knowledge Panel: Timeout nach 6s');
        } else {
            console.error('Luma Panel Error:', e);
        }
        return '';
    } finally {
        clearTimeout(timeout);
    }
}