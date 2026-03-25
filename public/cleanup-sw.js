/**
 * Service Worker Cleanup Script
 * Deregistriert alle Service Worker um Fehler zu beheben
 */

// Alle Service Worker deregistrieren
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const registration of registrations) {
            registration.unregister().then(success => {
                if (success) {
                    console.log('✓ Service Worker unregistered');
                    // Cache auch löschen
                    caches.keys().then(cacheNames => {
                        cacheNames.forEach(cacheName => {
                            caches.delete(cacheName);
                        });
                    });
                }
            });
        }
        // Nach dem Deregistrieren neuladen
        setTimeout(() => window.location.reload(), 1000);
    });
}
