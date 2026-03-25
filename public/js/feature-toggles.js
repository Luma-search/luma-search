// ── FEATURE TOGGLES ────────────────────────────────── 
window.lumaFeatureConfig = {
    calculator: true,
    currency: true
};

function updateFeatureIndicators() {
    const features = ['calculator', 'currency'];
    features.forEach(feature => {
        const btn = document.querySelector(`[data-feature="${feature}"]`);
        if (!btn) return;
        
        const isEnabled = localStorage.getItem(`feature_${feature}`) !== 'false';
        window.lumaFeatureConfig[feature] = isEnabled;
        
        const indicator = btn.querySelector('.toggle-indicator');
        
        if (indicator) {
            indicator.textContent = isEnabled ? '✓ ON' : 'OFF';
            indicator.style.color = isEnabled ? 'var(--green)' : 'var(--muted)';
        }
        
        // Update visibilty in search results
        const featureElements = document.querySelectorAll(`[data-feature-type="${feature}"]`);
        featureElements.forEach(el => {
            if (isEnabled) {
                el.classList.remove('feature-hidden');
                el.classList.add('feature-visible');
            } else {
                el.classList.add('feature-hidden');
                el.classList.remove('feature-visible');
            }
        });
    });
}

// Feature Toggle Click Handler
document.querySelectorAll('.feature-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const feature = btn.getAttribute('data-feature');
        const isCurrentlyEnabled = localStorage.getItem(`feature_${feature}`) !== 'false';
        localStorage.setItem(`feature_${feature}`, !isCurrentlyEnabled);
        
        updateFeatureIndicators();
        
        // Optional: Show confirmation
        const featureName = feature === 'calculator' ? 'Rechner' : 'Währungskonverter';
        const status = !isCurrentlyEnabled ? 'aktiviert' : 'deaktiviert';
        console.log(`${featureName} ${status}`);
    });
});

// Initialize feature indicators
updateFeatureIndicators();