/**
 * Renderer: Password Generator & Checker UI
 * 
 * Komponenten:
 * 1. Password Generator: Zeigt generierten Passwort mit Copy-Button
 * 2. Password Checker: Modal mit Input + Live-Analyse
 */

import { copyPasswordToClipboard } from '/autocomplete/sources/passwordSource.js';

// Helper: Warte auf Module
async function waitForPasswordModules(maxWait = 3000) {
    let waited = 0;
    while ((!window.PasswordStrengthAnalyzer || !window.SecurePasswordGenerator) && waited < maxWait) {
        await new Promise(r => setTimeout(r, 100));
        waited += 100;
    }
    return !!(window.PasswordStrengthAnalyzer && window.SecurePasswordGenerator);
}

// Preload modules im Hintergrund
waitForPasswordModules();

/**
 * Rendert Password-Feature (Generator ODER Checker)
 * @param {HTMLElement} list - Container zum Rendern
 * @param {Object} passwordData - Die Password-Daten von Source
 * @param {Function} onClose - Callback zum Schließen
 */
export function renderPassword(list, passwordData, onClose) {
    if (!passwordData) return;

    if (passwordData.mode === 'generator') {
        renderGenerator(list, passwordData, onClose);
    } else if (passwordData.mode === 'checker') {
        renderChecker(list, passwordData, onClose);
    }
}

// ─────────────────────────────────────────────────────────────
// GENERATOR RENDERER
// ─────────────────────────────────────────────────────────────

function renderGenerator(list, data, onClose) {
    const item = document.createElement('div');
    item.className = 'ia-card ia-card--password-gen';
    item.style.cssText = `
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 3px solid #C29A40;
        border-radius: 16px;
        padding: 18px 22px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        transition: all 0.2s ease;
    `;

    // Header mit Icon + Title
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    const icon = document.createElement('span');
    icon.style.cssText = `font-size: 24px; line-height: 1;`;
    icon.textContent = data.icon;
    const headerText = document.createElement('div');
    headerText.innerHTML = `
        <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #C29A40; margin-bottom: 4px;">Generator</div>
        <div style="font-size: 15px; font-weight: 600; color: #ededef;">Sicheres Passwort generiert</div>
    `;
    header.appendChild(icon);
    header.appendChild(headerText);

    // Passwort-Anzeige mit Monospace-Font
    const passwordBox = document.createElement('div');
    passwordBox.style.cssText = `
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 12px;
        background: rgba(0, 0, 0, 0.3);
        padding: 12px 14px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
    `;

    const passwordText = document.createElement('div');
    passwordText.style.cssText = `
        font-family: 'Courier New', monospace;
        font-size: 13px;
        color: #C29A40;
        letter-spacing: 1px;
        user-select: all;
        word-break: break-all;
    `;
    passwordText.textContent = data.password;

    // Copy-Button
    const copyBtn = document.createElement('button');
    copyBtn.innerHTML = '📋 Kopieren';
    copyBtn.style.cssText = `
        padding: 8px 14px;
        background: rgba(194,154,64,0.15);
        border: 1px solid rgba(194,154,64,0.3);
        color: #C29A40;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        transition: all 0.2s ease;
        white-space: nowrap;
    `;

    copyBtn.onmouseover = () => {
        copyBtn.style.background = 'rgba(194,154,64,0.25)';
        copyBtn.style.borderColor = 'rgba(194,154,64,0.5)';
    };
    copyBtn.onmouseout = () => {
        copyBtn.style.background = 'rgba(194,154,64,0.15)';
        copyBtn.style.borderColor = 'rgba(194,154,64,0.3)';
    };

    copyBtn.onclick = async (e) => {
        e.stopPropagation();
        const result = await copyPasswordToClipboard(data.password);
        if (result.success) {
            copyBtn.innerHTML = '✅ Kopiert!';
            copyBtn.style.color = '#4caf50';
            copyBtn.style.background = 'rgba(76,175,80,0.15)';
            copyBtn.style.borderColor = 'rgba(76,175,80,0.3)';
            setTimeout(() => {
                copyBtn.innerHTML = '📋 Kopieren';
                copyBtn.style.color = '#C29A40';
                copyBtn.style.background = 'rgba(194,154,64,0.15)';
                copyBtn.style.borderColor = 'rgba(194,154,64,0.3)';
            }, 2000);
        }
    };

    passwordBox.appendChild(passwordText);
    passwordBox.appendChild(copyBtn);

    // Metriken-Zeile
    const metrics = document.createElement('div');
    metrics.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
    `;

    const metricItems = [
        { label: 'Länge', value: `${data.length} Zeichen` },
        { label: 'Score', value: data.label },
        { label: 'Entropy', value: `${data.entropy} bits` },
        { label: 'Crack-Zeit', value: data.crackTime }
    ];

    metricItems.forEach(({ label, value }) => {
        const metric = document.createElement('div');
        metric.style.cssText = `
            display: grid;
            gap: 4px;
            padding: 8px 10px;
            background: rgba(255,255,255,0.04);
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.08);
        `;
        metric.innerHTML = `
            <span style="font-size: 10px; color: #888898; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase;">${label}</span>
            <span style="font-weight: 600; color: #ededef; font-size: 12px;">${value}</span>
        `;
        metrics.appendChild(metric);
    });

    // Security-Badge
    const badge = document.createElement('div');
    badge.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: #888898;
        padding: 10px 12px;
        background: rgba(255,255,255,0.03);
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 3px solid #F39C12;
    `;
    badge.innerHTML = `
        <span>⚠️</span>
        <span><strong style="color: #ededef;">Sicherheit:</strong> Passwort wird im RAM gehalten und nicht gespeichert</span>
    `;

    // Zusammenstellen
    item.appendChild(header);
    item.appendChild(passwordBox);
    item.appendChild(metrics);
    item.appendChild(badge);

    list.appendChild(item);

    // Hover-Effekt
    item.onmouseover = () => {
        item.style.borderColor = 'rgba(255,255,255,0.12)';
        item.style.background = 'rgba(255,255,255,0.06)';
    };
    item.onmouseout = () => {
        item.style.borderColor = 'rgba(255,255,255,0.08)';
        item.style.background = 'rgba(255,255,255,0.04)';
    };

    // ✅ Modal bleibt offen wenn User darin interagiert
    // Es schließt nur wenn User die Suchleiste ändert oder außerhalb klickt
    // (wird von renderPanel.js / createAutocomplete.js gehandlet)
}

// ─────────────────────────────────────────────────────────────
// CHECKER RENDERER
// ─────────────────────────────────────────────────────────────

function renderChecker(list, data, onClose) {
    const item = document.createElement('div');
    item.className = 'ia-card ia-card--password-checker';
    item.style.cssText = `
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 3px solid #C29A40;
        border-radius: 16px;
        padding: 18px 22px;
        display: flex;
        flex-direction: column;
        gap: 14px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
    `;
    const icon = document.createElement('span');
    icon.style.cssText = `font-size: 24px; line-height: 1;`;
    icon.textContent = '🔍';
    const headerText = document.createElement('div');
    headerText.innerHTML = `
        <div style="font-size: 10px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #C29A40; margin-bottom: 4px;">Analyzer</div>
        <div style="font-size: 15px; font-weight: 600; color: #ededef;">Passwort-Sicherheit prüfen</div>
    `;
    header.appendChild(icon);
    header.appendChild(headerText);

    // Input-Feld
    const inputBox = document.createElement('div');
    inputBox.style.cssText = `
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
    `;

    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = 'Passwort eingeben zum Checken...';
    input.style.cssText = `
        padding: 10px 14px;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        color: #ededef;
        font-size: 13px;
        font-family: 'Courier New', monospace;
        outline: none;
        transition: all 0.2s ease;
    `;

    input.onfocus = () => {
        input.style.borderColor = 'rgba(255,255,255,0.15)';
        input.style.background = 'rgba(0, 0, 0, 0.4)';
    };
    input.onblur = () => {
        input.style.borderColor = 'rgba(255,255,255,0.08)';
        input.style.background = 'rgba(0, 0, 0, 0.3)';
    };

    // Toggle Show/Hide
    const toggleBtn = document.createElement('button');
    toggleBtn.innerHTML = '👁️';
    toggleBtn.style.cssText = `
        padding: 8px 12px;
        background: rgba(194,154,64,0.15);
        border: 1px solid rgba(194,154,64,0.3);
        border-radius: 8px;
        color: #C29A40;
        cursor: pointer;
        transition: all 0.2s ease;
    `;

    toggleBtn.onmouseover = () => {
        toggleBtn.style.background = 'rgba(194,154,64,0.25)';
        toggleBtn.style.borderColor = 'rgba(194,154,64,0.5)';
    };
    toggleBtn.onmouseout = () => {
        toggleBtn.style.background = 'rgba(194,154,64,0.15)';
        toggleBtn.style.borderColor = 'rgba(194,154,64,0.3)';
    };

    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        input.type = input.type === 'password' ? 'text' : 'password';
        toggleBtn.innerHTML = input.type === 'password' ? '👁️' : '👁️‍🗨️';
    };

    inputBox.appendChild(input);
    inputBox.appendChild(toggleBtn);

    // Analyse-Ergebnis Container
    const analysisResult = document.createElement('div');
    analysisResult.style.cssText = `
        display: none;
        grid-template-columns: 1fr;
        gap: 10px;
    `;

    // Live-Analyse beim Typing
    input.oninput = async () => {
        const pwd = input.value;

        if (pwd.length > 0) {
            try {
                // Warte kurz bis Module verfügbar sind (max 500ms)
                let retries = 5;
                while (!window.PasswordStrengthAnalyzer && retries > 0) {
                    await new Promise(r => setTimeout(r, 100));
                    retries--;
                }

                if (!window.PasswordStrengthAnalyzer) {
                    analysisResult.style.display = 'none';
                    return;
                }
                
                const analyzer = new window.PasswordStrengthAnalyzer();
                const analysis = analyzer.analyze(pwd, { useCache: false, detailed: true });

                if (analysis && analysis.score !== undefined) {
                    analysisResult.style.display = 'grid';
                    renderAnalysisResult(analysisResult, analysis);
                } else {
                    analysisResult.style.display = 'none';
                }
            } catch (err) {
                console.error('Password analysis error:', err);
                analysisResult.style.display = 'none';
            }
        } else {
            analysisResult.style.display = 'none';
        }
    };

    // Info
    const info = document.createElement('div');
    info.style.cssText = `
        font-size: 12px;
        color: #888898;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-left: 3px solid #F39C12;
    `;
    info.innerHTML = `🔒 Ihr Passwort wird <strong style="color: #ededef;">NUR im RAM</strong> analysiert - nicht gespeichert oder übertragen!`;

    // Zusammenstellen
    item.appendChild(header);
    item.appendChild(inputBox);
    item.appendChild(analysisResult);
    item.appendChild(info);

    list.appendChild(item);

    // Focus
    setTimeout(() => input.focus(), 100);
}

// ─────────────────────────────────────────────────────────────
// ANALYZER RESULT
// ─────────────────────────────────────────────────────────────

function renderAnalysisResult(container, analysis) {
    container.innerHTML = '';

    // Score-Bar
    const scoreBar = document.createElement('div');
    scoreBar.style.cssText = `
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 12px;
    `;

    const scoreLabel = document.createElement('span');
    scoreLabel.textContent = analysis.label;
    scoreLabel.style.cssText = `
        font-weight: 600;
        font-size: 13px;
        color: ${analysis.color};
    `;

    const bar = document.createElement('div');
    bar.style.cssText = `
        height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        overflow: hidden;
        flex: 1;
    `;

    const fill = document.createElement('div');
    fill.style.cssText = `
        height: 100%;
        background: ${analysis.color};
        width: ${(analysis.score / 4) * 100}%;
        transition: width 0.3s ease;
        border-radius: 3px;
    `;
    bar.appendChild(fill);

    scoreBar.appendChild(scoreLabel);
    scoreBar.appendChild(bar);

    // Metriken
    const metrics = document.createElement('div');
    metrics.style.cssText = `
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 8px;
    `;

    [
        { label: 'Entropie', value: `${analysis.entropy}b` },
        { label: 'Länge', value: `${analysis.characterCount}` },
        { label: 'Crack-Zeit', value: analysis.crackTime },
        { label: 'NIST Score', value: `${analysis.nistScore}/5` }
    ].forEach(({ label, value }) => {
        const metric = document.createElement('div');
        metric.style.cssText = `
            padding: 6px 8px;
            background: rgba(255,255,255,0.04);
            border: 1px solid rgba(255,255,255,0.08);
            border-radius: 8px;
            font-size: 11px;
            color: #888898;
        `;
        metric.innerHTML = `<strong style="color: #ededef;">${label}:</strong> ${value}`;
        metrics.appendChild(metric);
    });

    // Recommendations
    if (analysis.recommendations && analysis.recommendations.length > 0) {
        const recsLabel = document.createElement('div');
        recsLabel.style.cssText = `
            font-size: 11px;
            font-weight: 600;
            color: #C29A40;
            margin-top: 2px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        `;
        recsLabel.textContent = '💡 Empfehlungen:';

        const recsList = document.createElement('ul');
        recsList.style.cssText = `
            margin: 4px 0 0 16px;
            padding: 0;
            font-size: 11px;
            color: #888898;
            list-style: none;
        `;

        analysis.recommendations.slice(0, 3).forEach(rec => {
            const li = document.createElement('li');
            li.style.cssText = 'margin: 3px 0; line-height: 1.4;';
            li.textContent = rec;
            recsList.appendChild(li);
        });

        container.appendChild(scoreBar);
        container.appendChild(metrics);
        container.appendChild(recsLabel);
        container.appendChild(recsList);
    } else {
        container.appendChild(scoreBar);
        container.appendChild(metrics);
    }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// (keine speziellen Helpers notwendig)

export default renderPassword;
