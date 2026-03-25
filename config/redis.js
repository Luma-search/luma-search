'use strict';
const Redis = require('ioredis');
let client = null;
let verbunden = false;

function getClient() {
    if (client) return client;
    client = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        lazyConnect: true,
        retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 500, 2000);
        },
        enableOfflineQueue: false,
    });
    client.on('connect', () => {
        verbunden = true;
        console.log('[Redis] ✅ Verbunden auf 127.0.0.1:6379');
    });
    client.on('error', () => { verbunden = false; });
    client.on('close', () => { verbunden = false; });
    client.connect().catch(() => {
        console.warn('[Redis] Nicht erreichbar - Cache deaktiviert, Luma laeuft weiter');
    });
    return client;
}

async function get(key) {
    try {
        const raw = await getClient().get(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

async function set(key, value, ttlSek = 300) {
    try {
        await getClient().set(key, JSON.stringify(value), 'EX', ttlSek);
    } catch {}
}

async function del(key) {
    try { await getClient().del(key); } catch {}
}

async function flushPrefix(prefix) {
    try {
        const keys = await getClient().keys(prefix + '*');
        if (keys.length > 0) await getClient().del(...keys);
    } catch {}
}

function isVerbunden() { return verbunden; }

// Verbindung sofort aufbauen, damit Status im Terminal sichtbar ist
getClient();

module.exports = { get, set, del, flushPrefix, isVerbunden, getClient };