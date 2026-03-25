const CACHE_NAME = 'luma-v3';
const OFFLINE_URL = '/offline.html';

// Dateien, die immer verfügbar sein sollen
const ASSETS_TO_CACHE = [
    OFFLINE_URL,
    '/icons/icon.svg',
    '/manifest.json'
];

// Installation: Offline-Seite cachen
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Abruf: Wenn Netzwerk fehlschlägt, Offline-Seite zeigen
self.addEventListener('fetch', (event) => {
    // Nur bei Navigation (HTML-Seiten) eingreifen
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(OFFLINE_URL);
            })
        );
    }
});

// Alte Caches löschen bei Update
self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});