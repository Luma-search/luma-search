#  🔍 Luma Search Engine — Die Suchmaschine für vertrauenswürdige Ergebnisse

> **Hinweis**: Luma ist mein **erstes großes Projekt** 🚀 und noch in **Beta-Phase**. Aber es funktioniert — und die Philosophie dahinter ist radikal anders als Google.
>
> **Die Vision**: Eine echte Alternative zu Google, die **Transparenz**, **Vertrauen** und **Datenschutz** in den Vordergrund stellt.

---

## ⭐ Was macht Luma besonders?

| Feature | Luma | Google |
|---------|------|--------|
| **Trust-Score vor Ranking** | ✅ Zentral | ❌ Ignoriert |
| **Datenschutz** | ✅ Keine Profilierung | ❌ Alles wird getrackt |
| **Transparenz** | ✅ Alle Ranking-Faktoren sichtbar | ❌ Black-Box |
| **Community-Moderation** | ✅ Nutzer können mitentscheiden | ❌ Algorithmus entscheidet |
| **Anti-Spam** | ✅ Aggressiver Spam-Filter | ❌ SEO-Spam überall |

---

## ✨ Kern-Features

### 🎯 Intelligente Suche
*   **Hybrides Suchsystem**: Kombiniert Keyword-Suche mit **semantischer KI** (`@xenova/transformers`) — versteht die Nutzer-Absicht präzise.
*   **Multilinguales Synonym-Matching**: Umfangreiches **Synonym-Wörterbuch** (`synonyms.json`) mit Rechtschreibungsprüfung und Spell-Checker.
*   **6-Phasen-Ranking-Algorithmus** (`ranking.js`):
    1. Spam-Filter & Hard-Blocks (Error Pages, Sitemaps, Affiliate-Links)
    2. Trust-Score Berechnung (E-A-T, Domain-Eigenschaften)
    3. Relevanz-Scoring (Keyword Match, Phrasen, Intent)
    4. Qualitäts-Metriken (Lesbarkeit, Content Depth)
    5. Finales Scoring (40% Trust + 35% Relevanz + 25% Qualität)
    6. Sortierung & Text-Highlighting

### 🏆 Vertrauen als Kernmetrik (Das Herzstück von Luma)
*   **Trust-Score System** (0-100 Skala):
    - **VERY_HIGH (80-100)**: Verifizierte Quellen, etablierte Domains
    - **HIGH (60-79)**: Zuverlässige Quellen
    - **MEDIUM (40-59)**: Standard Webseiten (mit Warnung)
    - **LOW (20-39)**: Fragwürdige Quellen (stark herabgestuft)
    - **VERY_LOW (<40)**: Blockiert oder nicht vertrauenswürdig
    
    > **Philosophie**: Bei Luma gilt "Vertrauen vor Verkehr". Lieber 100 qualitativ hochwertige Ergebnisse als 10.000 fragwürdige. Das unterscheidet uns fundamental von anderen Suchmaschinen.

### ⚡ Echtzeit-Features
*   **Trend-Engine**: Erkennt explodierende Suchanfragen in Echtzeit. Trends 20x häufiger = +36 Punkte Freshness-Bonus für heute veröffentlichte Artikel.
*   **Paywall-Erkennung**: Identifiziert bezahlschranken-gesicherte Inhalte durch Server-Analyse + Community-Berichte.
*   **Duplikat-Erkennung** (`simhash.js`): Content-Fingerprinting — ähnliche Artikel werden gefiltert, nur der beste angezeigt.

### 📊 KI-gestützte Widgets
*   **Knowledge Panel**: Strukturierte Informationen von Wikipedia & Wikidata direkt auf der Ergebnisseite.
*   **Ähnliche Fragen**: Accordion-Box mit verwandten Fragen (FAQ-Stil).
*   **News & Rezept-Widgets**: Spezielle Renderer für Nachrichten, Videos und Rezepte.
*   **Instant Answers**: Direkte Antworten auf Factoid-Fragen (z.B. "Wie hoch ist der Eiffelturm?").
*   **Spezial-Ergebnisse**: Kalkulator, Währungsumrechner, Wetter, Feiertag-Countdown, Emoji-Lookup.

### 👥 Community-Features
*   **Community Lists**: Nutzer erstellen kollaborative Listen zu Suchbegriffen.
*   **Anonyme Abstimmungen**: 👍/😐/👎 Reaktionen auf Suchergebnisse (gespeichert pro Domain).
*   **Mehrstufige Inhaltsmoderation**:
    - **Spam-Filter** (4-Level): Links, Emojis, Spam-Phrasen blockieren
    - **Beleidigungsfilter**: Automatische Erkennung offensichtlicher Schimpfwörter
    - **KI-Moderation**: Semantische Blacklist für Hassrede, Gewaltaufrufe etc.
*   **Moderator-Dashboard**: Admin-Interface zur Verwaltung geflaggter Inhalte.

### 🔐 Privacy & Sicherheit
*   **URL-Cleaning** (_Luma Cleaner_): Entfernt automatisch Tracking-Parameter (`utm_source`, `fbclid`, etc.) — saubere URLs.
*   **HTTPS/TLS Verschlüsselung**: Selbstsigniertes Zertifikat (`certificate.pem`), sichere Verbindungen erzwungen.
*   **Rate Limiting**: DDoS-Schutz mit express-rate-limit (1000/15min global, 60/min pro Search).
*   **XSS/SQL-Injection Protection**: Input-Validierung & Sanitization.
*   **Security Headers**: CSP, HSTS, X-Frame-Options konfiguriert.
*   **CORS Management**: Nur autorisierte Origins zugelassen.

### 🔍 Erweiterte Filter & Navigation
*   **Tab-System**: Alles | Bilder | Videos | Nachrichten | Fragen | Community
*   **Zeitfilter**: Letzte 24h, Woche, Monat, Jahr
*   **Bildergrid & Video-Player**: Lightbox-Integration, Lazy Loading
*   **Related Topics**: Zusammenhängende Suchanfragen vorschlagen

---

## 🛡️ Das Trust-System: Vertrauen als Kernmetrik

Das **Trust-Score System** ist das Herzstück von Luma und der Grund, warum wir existieren. Es quantifiziert die Vertrauenswürdigkeit einer Domain auf einer Skala von 0-100 und basiert auf **6 Kernbereichen**. Ergebnisse unter 40 Punkte werden normalerweise nicht angezeigt — es sei denn, der Nutzer sucht explizit danach.

### 📊 Trust-Score Zusammensetzung

#### 1. **E-A-T Signale** (max. 35 Punkte)
- **Expertise, Autorität, Vertrauenswürdigkeit**: Stammt der Inhalt von echten Experten?
- Der interne E-A-T-Wert (0-100) wird mit 35% gewichtet.
- Erkannt durch: Author-Informationen, Abschlüsse, Zertifikate, Publikationshistorie.

#### 2. **Domain-Eigenschaften** (max. 33 Punkte)
- **Domain-Autorität** (bis 25 Punkte):
  - Basiert auf eingehenden Backlinks (von anderen vertrauenswürdigen Seiten)
  - Memory-Cache mit 1-Stunden-TTL optimiert DB-Abfragen
  - Berechnet durch `domain-authority.js`
- **Domain-Alter** (bis 8 Punkte):
  - Über 10 Jahre: +8 Punkte
  - 5-10 Jahre: +6 Punkte
  - 2-5 Jahre: +3 Punkte
  - Unter 1 Jahr: 0 Punkte

#### 3. **Inhaltsqualität** (max. 18 Punkte)
- **Lesbarkeit** (bis 12 Punkte): Wie verständlich ist der Text für Durchschnittsnutzer?
- **Text-zu-Code-Verhältnis** (bis 5 Punkte): Wird echte Inhaltsqualität über Bloat bevorzugt?
- **Externe Link-Qualität** (bis 3 Punkte): Linkt die Seite zu seriösen Quellen?

#### 4. **Nutzer-Engagement** (max. 5 Punkte)
- **Klickrate (CTR)**: Wie oft klicken Nutzer auf dieses Ergebnis?
- **Verweilzeit**: Wie lange bleiben Nutzer auf der Seite?
- **Kommentare & Interaktion**: Aktive Community deutet auf relevante Inhalte hin.
- Erfasst durch `pogo-tracking.js` (Click-to-Bounce-Ratio).

#### 5. **Technische Sicherheit** (max. 15 Punkte)
- **HTTPS/SSL** (+7 Punkte): Sichere Verbindung ist Standard.
- **Mobile Optimierung** (+5 Punkte): Responsive Design & schnelle Ladezeiten.
- **Page Speed** (+3 Punkte): Schnelle Seiten erhalten Bonus.

#### 6. **Werbung & Monetisierung** (max. -15 Punkte Abzug)
- Luma bestraft **übermäßige Werbung**:
  - Wenige Anzeigen: Neutral (0 Punkte)
  - Viele eingebettete Ad-URLs: -5 bis -15 Punkte
- Affiliate-Links sind Hard-Blocker → werden gar nicht angezeigt

### 🔄 Trust-Scoring im Ranking-Prozess

```
Query → Rohe DB-Ergebnisse
    ↓
[Phase 1] Spam-Filter (CRITICAL/HIGH/MEDIUM/SAFE)
    ↓
[Phase 2] Trust-Score Berechnung  ← 6 Faktoren
    ├─ E-A-T Signale (35%)
    ├─ Domain Authority (25%)
    ├─ Content Quality (18%)
    ├─ User Engagement (5%)
    ├─ Technical Security (15%)
    └─ Ad Penalties (-15%)
    ↓
Trust-Score: 0-100
    ├─ < 40: BLOCKIERT (nicht angezeigt)
    ├─ 40-59: LOW (ganz oben warnen)
    ├─ 60-79: HIGH
    └─ 80-100: VERY_HIGH (bevorzugt)
    ↓
[Phase 3-6] Weitere Ranking-Faktoren kombiniert
    ↓
Finale Ranked Results
```

### 💬 Community-Trust-Multiplikatoren

Das `reciprocal-trust.js` Modul implementiert einen **PageRank-ähnlichen Algorithmus**:
- Trust fließt von hochvertrauenswürdigen Domains zu verlinkten Seiten
- Trust wird durch Anzahl ausgehender Links geteilt (höhere Spezifität = höherer Trust-Transfer)
- Community-Votes modifizieren Trust-Multiplikatoren:
  - Stark empfohlen (+45% positive Votes): ×1.2x Trust-Multiplikator
  - Stark negativ (-40% negative Votes): ×0.8x Trust-Multiplikator

### 📱 Trust-Badge im Frontend

Das `trust-badge.js` Modul zeigt den Trust-Score visuell an:
```html
<!-- Beispiel im Frontend -->
<div class="trust-badge score-80">
  <span class="trust-label">Sehr vertrauenswürdig</span>
  <span class="trust-score">80</span>
</div>
```

---

## 🛠️ Technologie-Stack

### Backend
- **Runtime**: Node.js v18+
- **Framework**: Express.js v5.2+
- **Datenbank**: PostgreSQL (Haupt-Index, Community-Daten, Semantische Embeddings)
- **Kaching**: In-Memory (Domain Authority, Events, Knowledge Panel) + localStorage (Frontend)

### AI & NLP
- **Semantische Suche**: `@xenova/transformers` v2.17+ (Modell: `paraphrase-multilingual-MiniLM-L12-v2`)
  - Läuft lokal (server-side & client-side möglich)
  - Keine externen LLM-Kosten
- **Fuzzy-Matching**: `fuse.js` v7.0+ (für Autocomplete-Fehlertoleranz)

### Web & Parsing
- **Server-Side DOM**: `cheerio` v1.2+ (HTML-Parsing, Content-Extraction)
- **Browser-Scraping**: `playwright` v1.58+ (JavaScript-Heavy-Sites)
- **Favicon Service**: Google CDN Integration

### Authentifizierung & Sessions
- **Passwort-Hashing**: `bcryptjs` v3.0+ (Salt 12)
- **Sessions**: `express-session` + `connect-pg-simple` (PostgreSQL-Backend)
- **Rate-Limiting**: `express-rate-limit` v8.2+ mit sliding window

### Utilities
- **Text-Kompression**: `compression` v1.8+ (gzip, deflate)
- **Umweltvariablen**: `dotenv` v17.3+
- **Scheduling**: `node-schedule` v2.1+ (Cron-Jobs)
- **Emoji**: `node-emoji` v2.2+
- **API-Client**: `axios` v1.13+
- **WHOIS-Daten**: `whois-json` v2.0+
- **SQL.js**: Für lokale DB-Operationen (SQLite in-Memory)

### Security
- **HTTPS/TLS**: Ein selbstsigniertes Zertifikat (`private-key.pem` + `certificate.pem`)
- **CORS**: Custom Middleware mit Whitelist
- **Security Headers**: CSP, HSTS, X-Content-Type-Options, X-Frame-Options


---

## 🗄️ PostgreSQL Datenbannbank-Schema

### Zentrale Tabellen
| Tabelle | Zweck | Wichtige Felder |
|---------|-------|-----------------|
| `luma_haupt_index` | Haupt-Suchdindex | `id`, `url`, `title`, `content`, `domain`, `tsvector` |
| `luma_domain_votes` | Anonyme Abstimmungen | `domain`, `positive`, `neutral`, `negative` |
| `luma_content_hashes` | SimHash-Fingerprints | `content_hash`, `url`, `similarity` |
| `luma_paywall_reports` | Paywall-Erkennungen | `url_hash`, `full_url`, `reporter_id` (optional anonym) |
| `luma_links` | Backlink-Struktur | `from_url`, `to_url`, `anchor_text` |
| `nutzer` | Authentifizierung | `id`, `username`, `password_hash`, `email` |
| `gemeinschafts_moderation_verdicts` | KI-Moderation | `beitrag_typ`, `beitrag_id`, `ahnlichkeit_score`, `geblocked`, `geflagged` |
| `gemeinschafts_moderation_actions` | Moderator-Actionen | `verdict_id`, `action` (approved/rejected), `moderator_note` |
| `luma_community_lists` | Benutzer-Listen | `query`, `entries`, `comments` |
| `suchprotokoll` | Query-Logger | `query`, `results_count`, `duration_ms`, `tab`, `timestamp` |

### In-Memory Caches (RAM, kein Disk)
- **Domain Authority**: 1 Stunde TTL (verhindert parallele DB-Abfragen)
- **Event Tracker**: 5.000 Events im RAM (Search, Security, Performance Metrics)
- **Knowledge Panel**: 10 Minuten TTL per localStorage (Frontend)
- **Semantic Embeddings**: Cache während Server-Runtime

---

## � Autocomplete & Instant Answers System

Das **Autocomplete-Modul** ist ein intelligentes System für Suchvorschläge, Live-Answers und spezialisierten Feature-Widgets.

### 🎯 Haupt-Features

#### 1. **Intelligente Suchvorschläge**
- **Fuzzy-Matching** (`fuse.js`): Fehlertolerant gegen Tippfehler
- **Score-Basiertes Ranking**: 
  - Titel-Match (höchste Gewichtung)
  - Content-Match
  - URL-Relevanz
- **Search-Type Detection**: Erkennt Query-Kategorien:
  - **Factoid**: "Wie hoch ist der Eiffelturm?" → Direct Answer
  - **How-To**: "Wie mache ich..." → Step-by-Step Guide
  - **Navigation**: "Facebook login" → Direct Link
  - **Transaktional**: "beste Kamera kaufen" → Product Listings

#### 2. **Instant Answers (Direct Answers)**
- **Zero-Click Info**: Direkte Antworten ohne Site-Besuch
- **Quellen**:
  - Wikipedia APIs (für Text/Fakten)
  - Wikidata (für strukturierte Daten, Bilder)
  - DuckDuckGo Zero-Click Info API
  - Externe Data Services

**Beispiele:**
```
Query: "население Deutschland"
→ Answer: "≈ 83,2 Millionen (2024)"
Source: Wikidata

Query: "wetter München"
→ Answer: "Montag 15°C, Regen"
Source: Weather Module
```

#### 3. **Spezial-Widgets & Feature-Renderer**

| Widget | Trigger-Query | Quelle |
|--------|---------------|--------|
| **Kalkulator** | `5 * 3 + 2`, `sqrt(144)` | `modules/calculator/` |
| **Währungsumrechner** | `100 EUR in USD` | `modules/currency_converter/` (Live-API) |
| **Wetter** | `wetter [Stadt]` | `modules/wetter/` (mehrere Quellen) |
| **Feiertag-Countdown** | `ostern 2026` | `modules/feiertag-countdown/` |
| **Emoji-Lookup** | `:smile:` oder `emoji smile` | `modules/emoji/` |
| **Unix-Timestamp** | `1234567890` → Date | `modules/unix-timestamp/` |
| **Zahlen aussprechbar** | `123` → "einhunddreiundzwanzig" | `modules/zahl-zu-wort/` |
| **Farbcodes** | `#ff0000` oder `rgb(255,0,0)` | Eigenentwicklung |

#### 4. **Keyword Database**
- **Route**: `GET /autocomplete/keyword-database`
- **Features**:
  - Kategorisierte Keywords pro Suchbereich
  - Frequency-Scoring
  - Priority-Ranking
  - In-Memory Cache (TTL: konfigurierbar)

#### 5. **Query Trends Tracking**
- **Route**: `GET /api/top-searches`, `POST /api/log-query`
- **Tracking**:
  - Top 50 aktuelle Suchanfragen
  - Trend-Volatilität (3 Trends, 8 Trends, 20+ Trends)
  - Query-Häufigkeit im Zeitfenster
  - Trend-Score Berechnung

**Privacy**: Nur anonyme Aggregaten, keine User-Identifikation

#### 6. **Related Searches / Ähnliche Fragen**
- **Route**: `GET /autocomplete/related`
- **Logic**:
  - Extrahiert FAQ-Strukturen aus serpserpages
  - Filtert Best-Matches & bereits angezeigt Fragen
  - Schlägt Query-relevante Alternative vor

#### 7. **Domain Guard (Security Check)**
- **Route**: `GET /autocomplete/domain-guard`
- **Features**:
  - Malware-Detection (externe APIs)
  - Phishing-Check
  - WHOIS-Daten Abruf
  - Trust-Score Validierung vor Suchvorschlag

#### 8. **Q&A System (Knowledge Base)**
- **Routes**:
  - `GET /autocomplete/answer?q=...` - Frage suchen
  - `POST /autocomplete/answer` - Neue Antwort speichern
- **Anwendung**: Für Nutzer-generierte Inhalte & Community-Knowledge

### 📊 Autocomplete API-Routes

```
GET  /autocomplete                          # Hauptvorschläge (Fuzzy-Match)
GET  /autocomplete/keyword-database         # Kategorisierte Keywords
GET  /autocomplete/calculator?expr=...      # Kalkulator-Widget
GET  /autocomplete/currency?from=EUR&to=USD # Währungsumrechner
GET  /autocomplete/product?q=...            # Produkt-Suche (E-Commerce)
GET  /autocomplete/answer?q=...             # Q&A Lookup
GET  /autocomplete/wiki?q=...               # Wikipedia Instant Answer
GET  /autocomplete/related?q=...            # Ähnliche Fragen
GET  /autocomplete/query-trends             # Top-Searches
POST /api/log-query                         # Query-Logging für Trends
GET  /autocomplete/domain-guard?domain=...  # Sicherheits-Check
GET  /autocomplete/chrono?timestamp=...     # Unix-Timestamp Konvertierung
GET  /autocomplete/emoji?q=...              # Emoji-Lookup
GET  /autocomplete/watt?q=...               # Stromverbrauch-Info
```

### 🔧 Autocomplete Architektur

```
USER TYPES QUERY
    ↓
GET /autocomplete?q=...
    ↓
autocomplete/core/
    ├─ Fuzzy-Scoring gegen DB
    ├─ Search-Type Detection
    └─ Suggestion-Ranking
    ↓
Parallel-Calls zu Feature-Modulen:
├─ /autocomplete/calculator (wenn mathematischer Ausdruck)
├─ /autocomplete/currency (wenn Währungskonversion)
├─ /autocomplete/wiki (wenn Factoid-Query)
├─ /autocomplete/domain-guard (Security-Check)
├─ /autocomplete/related (Ähnliche Fragen)
└─ /autocomplete/query-trends (Trending-Status)
    ↓
Cache-Check (500 Recent Queries im RAM)
    ↓
JSON Response:
[
  {
    query: "wetter münchen",
    type: "knowledge",
    source: "wikidata",
    answer: "Montag 15°C",
    url: "...",
    priority: 1000
  },
  ...max 10 Suggestions
]
    ↓
Frontend zeigt Dropdown mit Vorschlägen
```

### 📦 Autocomplete Sub-Module

| Modul | Funktion | Route |
|-------|----------|-------|
| `core/` | Haupt-Scoring & Fuzzy-Matching | /autocomplete |
| `renderers/` | Frontend-Output Formatting | (intern) |
| `sources/` | API-Integration (Wiki, DuckDuckGo, etc.) | (intern) |
| `styles/` | CSS f. Autocomplete-UI | (intern) |
| `utils/` | Helper-Funktionen | (intern) |
| `server/routes/` | Express.js Route Handler | /autocomplete/* |

### ⚙️ Konfiguration

**Datei**: `autocomplete/core/config.js` (oder .env)
```javascript
{
  CACHE_SIZE: 500,              // Max gecachte Queries
  CACHE_TTL: 3600000,           // 1 Stunde
  FUZZ_THRESHOLD: 50,           // Min. Fuzzy-Score
  MAX_SUGGESTIONS: 10,          // Max. Vorschläge
  ENABLE_INSTANT_ANSWERS: true,
  ENABLE_WIDGETS: true
}
```

### 🚀 Performance-Tipps

- **Caching**: 500 Recent Queries in RAM
- **Async Calls**: Parallel-Requests zu Feature-Modulen
- **Timeout Guards**: 500ms max pro Quelle
- **Query Logging**: Asynchron, blockiert nicht

---

## 🔧 Algorithmus & Ranking Details

> **Hinweis**: Für vollständige Algorithmus-Dokumentation siehe **README.COMPLETE.md**

Das Ranking-System basiert auf 6 Phasen, orchestriert durch `algorithmus/ranking.js`:

---

## 🌐 API-Dokumentation

### Haupt-Such-Endpoints

#### **GET /api/search** – Hauptsuche
```bash
GET /api/search?q=wetter&tab=Alles&page=1&lang=de
```

**Query-Parameter:**
- `q` (string): Suchbegriff (erforderlich)
- `tab` (string): Filter-Tab — Alles | Bilder | Videos | Nachrichten | Fragen | Community
- `page` (number): Seite (default: 1)
- `lang` (string): Sprache (default: de)

**Response:**
```json
{
  "results": [
    {
      "url": "https://example.com",
      "title": "Ergebnis",
      "content": "Kurzer Auszug...",
      "domain": "example.com",
      "score": 85,
      "trustScore": 78,
      "image": "https://...",
      "isDuplicate": false,
      "votes": { "positive": 45, "neutral": 10, "negative": 2 }
    }
  ],
  "total": 234,
  "time_ms": 152
}
```

### Community & Feedback API

#### **POST /api/reviews** – Bewertung abgeben
```bash
POST /api/reviews
{
  "domain": "example.com",
  "stars": 4,
  "user": "Anonymous",
  "text": "Sehr hilfreiche Inhalte"
}
```

#### **GET /api/votes?domain=example.com** – Votes abrufen
```bash
GET /api/votes?domain=example.com
```

**Response:**
```json
{
  "domain": "example.com",
  "positive": 145,
  "neutral": 28,
  "negative": 12,
  "trustMultiplier": 1.15
}
```

#### **POST /api/paywall** – Paywall melden
```bash
POST /api/paywall
{
  "url": "https://example.com/article",
  "type": "soft" | "hard"
}
```

### Admin & Moderation API

#### **GET /api/admin/moderation/queue** – Moderations-Queue
```bash
GET /api/admin/moderation/queue
```

**Response:**
```json
{
  "queue": [
    {
      "id": 123,
      "beitrag_typ": "comment",
      "text": "...",
      "erkanntes_pattern": "HATE_SPEECH",
      "ahnlichkeit_score": 0.92,
      "status": "flagged"
    }
  ],
  "total": 15
}
```

#### **POST /api/admin/moderation/approve/:id** – Genehmigen
```bash
POST /api/admin/moderation/approve/123
{
  "moderator_note": "OK"
}
```

#### **GET /api/admin/moderation/stats** – Moderations-Statistiken
```bash
GET /api/admin/moderation/stats
```

### User & Auth API

#### **POST /api/auth/register** – Registrieren
```bash
POST /api/auth/register
{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepass"
}
```

#### **POST /api/auth/login** – Einloggen
```bash
POST /api/auth/login
{
  "username": "newuser",
  "password": "securepass"
}
```

#### **GET /api/blacklist** – URL-Blacklist abrufen (nur angemeldet)
```bash
GET /api/blacklist
```

#### **POST /api/blacklist** – URL zur Blacklist hinzufügen
```bash
POST /api/blacklist
{
  "url": "https://spam.example.com"
}
```

### Tracking API

#### **POST /api/klick** – Klick registrieren
```bash
POST /api/klick
{
  "url": "https://example.com",
  "domain": "example.com",
  "position": 1,
  "suchanfrage": "wetter"
}
```

**Response:**
```json
{
  "klickId": "abc123xyz",
  "session": "session-uuid"
}
```

#### **POST /api/verweilzeit** – Verweilzeit melden (Beacon)
```bash
POST /api/verweilzeit
{
  "klickId": "abc123xyz",
  "duration_ms": 15000,
  "scrollDepth": 65
}
```

### Admin Dashboard API

#### **GET /api/admin/analytics** – Analytics für Dashboard
```bash
GET /api/admin/analytics
```

**Response:**
```json
{
  "summary": {
    "totalSearches": 45230,
    "averageResponseTime": 152,
    "topQueries": ["wetter", "nachrichten", "rezepte"]
  },
  "topSearches": [...],
  "securityEvents": [...],
  "performance": {...}
}
```

#### **GET /api/admin/health** – Server Health Check
```bash
GET /api/admin/health
```

**Response:**
```json
{
  "status": "online",
  "uptime": 12345.67,
  "eventCount": 5000
}
```

---

## 👥 Community Features

### 📋 Community Lists
Nutzer können kollaborative Listen zu Suchbegriffen erstellen:
```
Query: "beste rezepte"
├─ Liste 1: "Einfache Pasta-Rezepte" (45 Einträge)
├─ Liste 2: "Vegane Gerichte" (23 Einträge)
└─ Liste 3: "Keto-freundliche Snacks" (12 Einträge)
```

**Features:**
- Entries + Kommentare pro Liste
- Cache-frei (TTL=0): Always aktuelle Daten
- Inline im "Community"-Tab angezeigt

### 🗳️ Anonyme Abstimmungen
Jeden Such-Ergebnis kann der Nutzer eine Reaktion geben:
- 👍 **Positive** – hilfreiche/relevante Quelle
- 😐 **Neutral** – okay aber nicht großartig
- 👎 **Negative** – nicht hilfreich/irreführend

**Speicherung:**
- Aggregiert auf Domain-Ebene in `luma_domain_votes`
- Keine Benutzer-IDs, keine Text-Speicherung → vollständig anonym
- Beeinflusst Trust-Multiplikator in`reciprocal-trust.js`

### 🛡️ Moderations-System
**Workflow:**
1. Beitrag wird gepostet (Comment, List-Entry, etc.)
2. KI oder Regelbasiert geflagged
3. In `gemeinschafts_moderation_verdicts` gespeichert
4. Moderator sieht in `/api/admin/moderation/queue`
5. Moderator genehmigt (approved) oder lehnt ab (rejected)
6. Aktion in`gemeinschafts_moderation_actions` protokolliert

---

## 🚀 Installation & Einstieg

### Voraussetzungen
- **Node.js** v18+
- **PostgreSQL** 13+
- **npm** oder **yarn**

### 1. Repository klonen & Dependencies installieren
```bash
cd /path/to/luma
npm install
```

### 2. Umgebungsvariablen setzen
```bash
cp .env.example .env
# Bearbeite .env mit deinen PostgreSQL-Credentials:
# DATABASE_URL=postgresql://user:password@localhost:5432/luma
# PORT=3000
# HTTPS_PORT=3443
```

### 3. PostgreSQL Datenbannbank initialisieren
```bash
npm run migrate
# oder manuell:
# node migrations/create-admin-moderation-tables.js
# node migrations/create-ai-moderation-system.js
# etc.
```

### 4. Server starten
```bash
# Entwicklung:
npm run dev

# Produktion:
npm start
```

Der Server läuft dann auf:
- **HTTP**: http://localhost:3000
- **HTTPS**: https://localhost:3443 (keine Zertifikat vorhanden)

### 5. Admin-Benutzer erstellen (optional)
```bash
npm run create-admin
# oder POST zu /api/auth/register
```

---

## 📊 Nutzung & Workflows

### Standard-Suche
```bash
# Browser:
https://localhost:3000/?q=wetter

# API:
curl -X GET "http://localhost:3000/api/search?q=wetter&tab=Alles"
```

### Tracking aktivieren (Frontend)
Der Server empfängt automatisch Click- & Verweilzeit-Signale via `sendBeacon`. Keine zusätzliche Konfiguration nötig.

### Admin-Dashboard ansehen
```
https://localhost:3000/admin.html
[Admin User Credentials]
```

Hier siehst du:
- Welcome Analytics (Top-Queries, Avg. Response Time)
- Security Logs (XSS-Attempts, Rate-Limiting Triggers)
- Trust Analytics (Trust-Score Distribution)
- Health Check (Uptime, Event Count)

### Moderation durchführen
```
https://localhost:3000/admin.html → Moderation Tab
```

- Queue von geflaggten Inhalten
- Pro Item: Preview, Erkanntes Pattern, Similarity Score
- Action: Approve / Reject
- Moderator-Note hinzufügen

---

## 🔑 Konfiguration

### Security Anpassen
**Datei**: `config/security-config.js`
```javascript
{
  HTTPS_ENABLED: true,
  PORT: 3000,
  HTTPS_PORT: 3443,
  RATE_LIMIT: {
    windowMs: 15 * 60 * 1000,  // 15 min
    max: 1000                   // 1000 requests/window
  }
}
```

### Moderation-Schwellenwerte
**Datei**: `modules/semantic-content-moderation.js`
- Ändere die `THRESHOLD` Werte für HATE_SPEECH, VIOLENCE, etc.

### Database Connection
**Datei**: `.env`
```
DATABASE_URL=postgresql://...
```

---

## 📈 Skalierung & Performance

### Memory-Optimierung
- Domain Authority Cache: 1-Stunden-TTL (verhindert N+1 queries)
- Event Tracker: Max 5.000 Events (älteste werden gelöscht)
- Knowledge Panel: Batch-Anfragen + localStorage

### Database Indizes
Wichtig für Performance ab >10.000 Seiten:
```sql
CREATE INDEX idx_title_tsvector ON luma_haupt_index USING gin(to_tsvector('german', title));
CREATE INDEX idx_domain_votes ON luma_domain_votes(domain);
CREATE INDEX idx_links_from ON luma_links(from_url);
```

### Skalierung zu mehreren Servern
- Redis Caching empfohlen (für shared Cache über mehrere Instanzen)
- PostgreSQL Connection Pooling (z.B. pgBouncer)
- Load Balancer (nginx, HAProxy)

---

## 🐛 Debugging & Logs

### Server Logs
```bash
# Verbose
DEBUG=luma:* npm start


## 📝 Lizenz & Kontakt

**Autor**: Felix (Luma Development)



4.  **Server starten**:
    ```bash
    node server.js
    ```
