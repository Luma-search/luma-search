/**
 * Luma Answer-Box Komponente
 * Zeigt Antworten wie Google in einer Info-Box an
 * Ähnlich: answer.js & wiki.js, aber im alles.js als separates Element
 */

export async function getAnswerBox(query) {
    if (!query || query.trim().length < 2) return null;

    try {
        const answerRes = await fetch(`/answer_autocomplete?q=${encodeURIComponent(query)}`).catch(() => null);
        if (!answerRes?.ok) return null;

        const json = await answerRes.json();
        if (!json || typeof json !== 'object') return null;

        // Antwort gefunden
        if (json.found === true && json.answer) {
            return {
                type: 'answer',
                found: true,
                title: json.question || query,
                answer: json.answer,
                url: json.source_url || null,
            };
        }

        // Nicht gefunden → Community-Box anzeigen
        if (json.found === false) {
            return {
                type: 'community',
                found: false,
                title: json.question || query,
            };
        }

        return null;
    } catch (err) {
        console.warn('Answer-Box loading error:', err);
        return null;
    }
}

/**
 * Rendert die Answer-Box und gibt HTML-String zurück
 */
export function renderAnswerBox(data) {
    if (!data) return '';

    // ── Gefundene Antwort ─────────────────────────────────────────────────────
    if (data.found === true) {
        const sourceLink = data.url
            ? `<a href="${escAttr(data.url)}" target="_blank" rel="noopener" style="color:#8ab4f8;font-size:11px;text-decoration:none;opacity:0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'">Quelle ↗</a>`
            : '';
        return `
        <div id="luma-answer-box" class="luma-answer-box" role="region" aria-label="Antwort zur Frage">
            <div class="answer-box-content">
                <div class="answer-box-text">
                    <div class="answer-box-title">${escAttr(data.title)}</div>
                    <div class="answer-box-answer">${escDangerousHtml(data.answer)}</div>
                    ${sourceLink ? `<div style="margin-top:6px;">${sourceLink}</div>` : ''}
                </div>
            </div>
        </div>`;
    }

    // ── Keine Antwort → Community-Eingabe ─────────────────────────────────────
    if (data.found === false) {
        const boxId = 'luma-community-' + Math.random().toString(36).slice(2, 7);
        const msgId = 'luma-msg-' + Math.random().toString(36).slice(2, 7);
        const question = data.title;

        window[`_lumaSubmit_${boxId}`] = async function() {
            const textarea = document.querySelector(`#${boxId} textarea`);
            const msgEl    = document.getElementById(msgId);
            const btn      = document.querySelector(`#${boxId} button`);
            const answer   = textarea?.value?.trim();

            if (!answer || answer.length < 5) {
                if (msgEl) { msgEl.style.color = '#f28b82'; msgEl.textContent = 'Bitte schreibe mindestens einen Satz.'; }
                return;
            }
            if (btn) { btn.disabled = true; btn.textContent = 'Wird gesendet…'; }

            try {
                const res = await fetch('/answer_submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ question, answer })
                });
                const result = await res.json();
                if (result.ok) {
                    const box = document.getElementById(boxId);
                    if (box) box.innerHTML = `<div style="color:#81c995;font-size:14px;padding:4px 0;">✓ Danke! Deine Antwort hilft anderen Nutzern.</div>`;
                } else {
                    if (msgEl) { msgEl.style.color = '#f28b82'; msgEl.textContent = 'Fehler beim Speichern.'; }
                    if (btn) { btn.disabled = false; btn.textContent = 'Antwort einreichen'; }
                }
            } catch {
                if (msgEl) { msgEl.style.color = '#f28b82'; msgEl.textContent = 'Verbindungsfehler.'; }
                if (btn) { btn.disabled = false; btn.textContent = 'Antwort einreichen'; }
            }
        };

        return `
        <div id="${boxId}" class="luma-answer-box" role="region">
            <div class="answer-box-content">
                <div class="answer-box-text">
                    <div style="color:#9aa0a6;font-size:13px;margin-bottom:4px;">
                        Noch keine Antwort auf
                    </div>
                    <div class="answer-box-title" style="margin-bottom:8px;">
                        ${escAttr(question)}
                    </div>
                    <div style="color:#9aa0a6;font-size:12px;margin-bottom:6px;">
                        Hilf dem nächsten Nutzer — schreib die erste Antwort! 👇
                    </div>
                    <textarea placeholder="Schreibe hier deine Antwort…" rows="3" style="width:100%;margin-top:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(138,180,248,0.25);border-radius:8px;color:#e8eaed;font-size:13px;padding:10px 12px;resize:vertical;outline:none;box-sizing:border-box;font-family:inherit;line-height:1.5;" onfocus="this.style.borderColor='rgba(138,180,248,0.6)'" onblur="this.style.borderColor='rgba(138,180,248,0.25)'"></textarea>
                    <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
                        <button type="button" onclick="window['_lumaSubmit_${boxId}\']()" style="background:rgba(138,180,248,0.15);border:1px solid rgba(138,180,248,0.35);color:#8ab4f8;padding:7px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;" onmouseover="this.style.background='rgba(138,180,248,0.25)'" onmouseout="this.style.background='rgba(138,180,248,0.15)'">Antwort einreichen</button>
                        <span id="${msgId}" style="font-size:12px;color:#9aa0a6;"></span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    return '';
}

/**
 * CSS für Answer-Box
 */
export function injectAnswerBoxStyles() {
    if (document.getElementById('luma-answer-box-styles')) return;

    const style = document.createElement('style');
    style.id = 'luma-answer-box-styles';
    style.textContent = `
        #luma-answer-box {
            background: #1f1f23;
            border: 1px solid #3c4043;
            border-left: 3px solid #8ab4f8;
            border-radius: 6px;
            padding: 14px 16px;
            margin-bottom: 20px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
            display: block;
            animation: answerBoxFadeIn 0.3s ease-in;
        }

        @keyframes answerBoxFadeIn {
            from {
                opacity: 0;
                transform: translateY(-6px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .answer-box-content {
            display: flex;
            gap: 12px;
        }

        .answer-box-text {
            flex: 1;
            min-width: 0;
        }

        .answer-box-title {
            font-size: 16px;
            font-weight: 600;
            color: #8ab4f8;
            margin-bottom: 6px;
            word-break: break-word;
        }

        .answer-box-answer {
            font-size: 13px;
            line-height: 1.5;
            color: #bdc1c6;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            word-break: break-word;
        }

        /* Responsive */
        @media (max-width: 600px) {
            #luma-answer-box {
                padding: 12px 14px;
                margin-bottom: 16px;
            }

            .answer-box-title {
                font-size: 15px;
            }

            .answer-box-answer {
                font-size: 12px;
                -webkit-line-clamp: 3;
            }
        }
    `;

    document.head.appendChild(style);
}

/**
 * Escape Attribute-Werte
 */
function escAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * Escape HTML aber erlaubt einige sichere Tags
 */
function escDangerousHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    let html = div.innerHTML;

    // Maximal 3 Zeilen / 300 Zeichen
    if (str && str.length > 300) {
        const shortened = str.substring(0, 300).split('\n').slice(0, 3).join('<br/>');
        div.textContent = shortened;
        html = div.innerHTML + '...';
    } 

    return html;
}