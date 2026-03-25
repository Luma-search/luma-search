'use strict';

/**
 * category-mismatch.js
 * Berechnet einen Penalty wenn die Seiten-Kategorie nicht zur Query passt.
 *
 * Importiert direkt aus categories.js — Single Source of Truth.
 * Nie mehr zwei Systeme synchron halten.
 *
 * Pfad-Anpassung: categories.js liegt in crawler_new/lib/categories.js
 * category-mismatch.js liegt in algorithmus/intelligence/category-mismatch.js
 * → relativer Pfad: ../../../crawler_new/lib/categories
 */

const { KATEGORIEN, KATEGORIE_BY_SLUG } = require('../../crawler_new/lib/categories');

// ─── Alle gültigen Slugs aus categories.js (automatisch aktuell) ──────────────
const ALLE_SLUGS = new Set(KATEGORIEN.map(k => k.slug));

// ─── Query → Intent-Gruppe ────────────────────────────────────────────────────
// allowedCategories und penalties nutzen echte Slugs aus categories.js
const QUERY_INTENT_MAP = {

  FINANZEN: {
    terms: ['finanzen', 'finanz', 'geld', 'bank', 'sparkasse', 'kredit', 'aktie',
            'börse', 'anlage', 'investition', 'steuer', 'versicherung', 'rente',
            'depot', 'fonds', 'etf', 'dividende', 'zinsen', 'dax'],
    allowedCategories: [
      'boerse-finanzen', 'wirtschaft-business', 'unternehmen-startups',
      'recht-justiz', 'bildung-wissenschaft',
      'arbeitsmarkt', 'energie-rohstoffe', 'immobilien',
    ],
    penalties: {
      STRONG: ['sport', 'fussball', 'motorsport', 'wintersport', 'wassersport',
               'outdoor-extremsport', 'fitness-wellness', 'automotive',
               'essen-trinken', 'rezepte-kochen', 'lifestyle-freizeit',
               'internet-social-media', 'kultur-medien'],
      MEDIUM: ['politik-gesellschaft', 'regierung-parteien', 'militaer-konflikte',
               'soziales-migration', 'naher-osten-afrika', 'deutschland-region',
               'europa-region', 'gesundheit-medizin',
               'reise-tourismus', 'tiere-natur', 'familie-kinder', 'wohnen-einrichten'],
      WEAK:   ['technik-digitales', 'cybersecurity', 'software-ki', 'weitere', 'nachrichten'],
    },
  },

  AUTO: {
    terms: ['auto', 'car', 'fahrzeug', 'pkw', 'kfz', 'elektroauto',
            'motorrad', 'hybrid', 'verbrenner', 'führerschein', 'reifenwechsel',
            'werkstatt', 'tankstelle', 'sprit', 'benzin', 'diesel', 'wohnmobil'],
    allowedCategories: [
      'automotive', 'unternehmen-startups',
      'energie-rohstoffe',
    ],
    penalties: {
      STRONG: ['essen-trinken', 'rezepte-kochen', 'gesundheit-medizin',
               'fussball', 'wintersport', 'wassersport',
               'kultur-medien', 'mode-shopping', 'bildung-wissenschaft'],
      MEDIUM: ['lifestyle-freizeit', 'reise-tourismus', 'tiere-natur',
               'familie-kinder', 'wohnen-einrichten', 'technik-digitales',
               'deutschland-region', 'geografie-regionen'],
      WEAK:   ['wirtschaft-business', 'politik-gesellschaft', 'weitere', 'nachrichten'],
    },
  },

  TECH: {
    terms: ['smartphone', 'laptop', 'computer', 'software', 'app', 'ki', 'ai',
            'künstliche intelligenz', 'internet', 'cybersecurity', 'hacker',
            'iphone', 'android', 'windows', 'linux', 'chip', 'prozessor'],
    allowedCategories: [
      'technik-digitales', 'cybersecurity', 'software-ki', 'hardware-pc',
      'internet-social-media', 'bildung-wissenschaft', 'unternehmen-startups',
    ],
    penalties: {
      STRONG: ['essen-trinken', 'rezepte-kochen', 'fussball', 'sport',
               'wintersport', 'wassersport', 'mode-shopping'],
      MEDIUM: ['lifestyle-freizeit', 'reise-tourismus', 'kultur-medien',
               'tiere-natur', 'familie-kinder'],
      WEAK:   ['gesundheit-medizin', 'naher-osten-afrika',
               'militaer-konflikte', 'weitere', 'nachrichten'],
    },
  },

  GESUNDHEIT: {
    terms: ['gesundheit', 'krankheit', 'arzt', 'medikament', 'symptome',
            'therapie', 'ernährung', 'krankenhaus', 'impfung', 'diagnose',
            'krebs', 'diabetes', 'burnout', 'depression'],
    allowedCategories: [
      'gesundheit-medizin', 'krankheit-therapie', 'psyche-mental-health',
      'ernaehrung-diaet', 'praevention-vorsorge',
      'bildung-wissenschaft',
    ],
    penalties: {
      STRONG: ['sport', 'fussball', 'motorsport', 'automotive',
               'essen-trinken', 'kultur-medien', 'mode-shopping'],
      MEDIUM: ['wirtschaft-business', 'lifestyle-freizeit', 'reise-tourismus',
               'tiere-natur', 'wohnen-einrichten'],
      WEAK:   ['technik-digitales', 'naher-osten-afrika', 'weitere', 'nachrichten'],
    },
  },

  REISE: {
    terms: ['reise', 'urlaub', 'hotel', 'flug', 'strand', 'ferien',
            'sehenswürdigkeit', 'backpacking', 'kreuzfahrt', 'mietwagen'],
    allowedCategories: [
      'reise-tourismus', 'staedtereisen', 'fernreisen-exotik',
      'hotels-unterkunft', 'verkehr-transport',
      'lifestyle-freizeit',
    ],
    penalties: {
      STRONG: ['automotive', 'essen-trinken', 'fussball', 'sport',
               'mode-shopping', 'boerse-finanzen'],
      MEDIUM: ['technik-digitales', 'wirtschaft-business', 'gesundheit-medizin',
               'tiere-natur'],
      WEAK:   ['naher-osten-afrika', 'militaer-konflikte',
               'bildung-wissenschaft', 'weitere', 'nachrichten'],
    },
  },

  REZEPT: {
    terms: ['rezept', 'kochen', 'backen', 'zutaten', 'gericht', 'mahlzeit',
            'küche', 'speise', 'zubereitung', 'kuchen', 'suppe', 'chefkoch'],
    allowedCategories: [
      'essen-trinken', 'rezepte-kochen', 'lebensmittel-zutaten',
      'restaurants-gastro', 'getraenke-wein',
      'lifestyle-freizeit',
    ],
    penalties: {
      STRONG: ['automotive', 'sport', 'fussball', 'technik-digitales',
               'wirtschaft-business', 'militaer-konflikte', 'boerse-finanzen',
               'gesundheit-medizin', 'politik-gesellschaft', 'recht-justiz'],
      MEDIUM: ['reise-tourismus', 'kultur-medien', 'mode-shopping',
               'bildung-wissenschaft', 'deutschland-region'],
      WEAK:   ['naher-osten-afrika', 'weitere', 'nachrichten'],
    },
  },

  SPORT: {
    terms: ['fußball', 'bundesliga', 'champions league', 'formel 1', 'tennis',
            'basketball', 'handball', 'eishockey', 'ski', 'biathlon', 'motogp',
            'tour de france', 'olympia', 'paralympics', 'dfb', 'transfermarkt'],
    allowedCategories: [
      'sport', 'fussball', 'motorsport', 'wintersport', 'wassersport',
      'fitness-wellness', 'outdoor-extremsport',
    ],
    penalties: {
      STRONG: ['essen-trinken', 'rezepte-kochen', 'immobilien',
               'boerse-finanzen', 'mode-shopping', 'automotive'],
      MEDIUM: ['gesundheit-medizin', 'reise-tourismus', 'technik-digitales',
               'tiere-natur', 'wohnen-einrichten', 'unternehmen-startups',
               'militaer-konflikte', 'naher-osten-afrika', 'kultur-medien'],
      WEAK:   ['politik-gesellschaft', 'wirtschaft-business', 'weitere', 'nachrichten'],
    },
  },

  POLITIK: {
    terms: ['politik', 'wahl', 'bundesregierung', 'bundestag', 'minister',
            'partei', 'cdu', 'spd', 'grüne', 'afd', 'gesetz', 'krieg', 'nato',
            'kanzler', 'koalition', 'parlament'],
    allowedCategories: [
      'politik-gesellschaft', 'regierung-parteien', 'militaer-konflikte',
      'soziales-migration', 'recht-justiz', 'umwelt-klima',
      'naher-osten-afrika', 'deutschland-region', 'europa-region',
      'bildung-wissenschaft',
    ],
    penalties: {
      STRONG: ['essen-trinken', 'rezepte-kochen', 'lifestyle-freizeit',
               'mode-shopping', 'tiere-natur', 'boerse-finanzen',
               'motorsport', 'wintersport', 'wassersport'],
      MEDIUM: ['sport', 'fussball', 'automotive', 'reise-tourismus',
               'wohnen-einrichten', 'immobilien', 'kultur-medien'],
      WEAK:   ['gesundheit-medizin', 'technik-digitales', 'unternehmen-startups', 'weitere', 'nachrichten'],
    },
  },
};

const PENALTY_VALUES = { STRONG: 15, MEDIUM: 8, WEAK: 3 };

// ─── URL-Segmente direkt aus categories.js ableiten ───────────────────────────
// Nutzt die urlPaths-Regexes aus KATEGORIEN für konsistente Erkennung
function resolveByUrl(url) {
  for (const kat of KATEGORIEN) {
    if (kat.detection && kat.detection.urlPaths) {
      if (kat.detection.urlPaths.test(url)) {
        return kat.slug;
      }
    }
  }
  return null;
}

// ─── Breadcrumb direkt aus categories.js ableiten ────────────────────────────
function resolveByBreadcrumb(breadcrumbs) {
  if (!Array.isArray(breadcrumbs) || breadcrumbs.length < 2) return null;
  for (let i = 1; i < Math.min(breadcrumbs.length - 1, 4); i++) {
    const crumb = String(breadcrumbs[i]).toLowerCase().trim();
    for (const kat of KATEGORIEN) {
      if (kat.detection && kat.detection.breadcrumbs) {
        if (kat.detection.breadcrumbs.test(crumb)) {
          return kat.slug;
        }
      }
    }
  }
  return null;
}

// ─── Kern-Logik: echte Kategorie ermitteln ────────────────────────────────────
function resolveCategory(item) {
  // 1. DB-Spalte — nur wenn spezifisch (nicht generische Fallbacks)
  const dbKat = (item.kategorie || '').toLowerCase().trim();
  const GENERIC = new Set(['news', 'other', 'nachrichten', 'weitere', '']);
  if (dbKat && !GENERIC.has(dbKat) && ALLE_SLUGS.has(dbKat)) {
    return dbKat;
  }

  const url = (item.url || item.link || item.href || '').toLowerCase();

  // 2. URL-Pfadsegmente (via categories.js detection.urlPaths)
  const byUrl = resolveByUrl(url);
  if (byUrl) return byUrl;

  // 3. Breadcrumb-Array (via categories.js detection.breadcrumbs)
  let breadcrumbs = item.breadcrumb || item.breadcrumbs || [];
  if (typeof breadcrumbs === 'string') {
    try { breadcrumbs = JSON.parse(breadcrumbs); } catch { breadcrumbs = []; }
  }
  const byBreadcrumb = resolveByBreadcrumb(breadcrumbs);
  if (byBreadcrumb) return byBreadcrumb;

  // 4. Fallback
  return dbKat || 'nachrichten';
}

// ─── Öffentliche API ──────────────────────────────────────────────────────────
/**
 * @param {string}        query  Suchanfrage
 * @param {object|string} item   DB-Item oder (legacy) Kategorie-String
 * @returns {{ penalty: number, reason: string, resolvedCategory: string }}
 */
function getCategoryPenalty(query, item) {
  // Abwärtskompatibilität: alter Aufruf mit String
  if (typeof item === 'string') {
    item = { kategorie: item };
  }
  if (!item || typeof item !== 'object') {
    return { penalty: 0, reason: 'no_item', resolvedCategory: 'unknown' };
  }

  const q = (query || '').toLowerCase().trim();
  const resolvedCategory = resolveCategory(item);

  // Tags aus DB (["automotive", "boerse-finanzen", ...])
  const itemTags = Array.isArray(item.tags) ? item.tags : [];

  // Intent ermitteln
  let matchedIntent = null;
  for (const [intentName, intent] of Object.entries(QUERY_INTENT_MAP)) {
    if (intent.terms.some(term => q.includes(term))) {
      matchedIntent = { name: intentName, ...intent };
      break;
    }
  }

  if (!matchedIntent) {
    return { penalty: 0, reason: 'no_intent_match', resolvedCategory };
  }

  // Haupt-Kategorie erlaubt?
  if (matchedIntent.allowedCategories.includes(resolvedCategory)) {
    return { penalty: 0, reason: 'category_allowed', resolvedCategory };
  }

  // Tags prüfen: wenn irgendein Tag in allowedCategories → kein Penalty
  // Beispiel: kategorie=militaer-konflikte, tags=[..., "boerse-finanzen"]
  // Suche "finanzen" → Tag passt → kein Penalty
  if (itemTags.some(tag => matchedIntent.allowedCategories.includes(tag))) {
    return { penalty: 0, reason: 'tag_allowed', resolvedCategory };
  }

  // Tags prüfen: niedrigsten Penalty aus Tags nehmen (nicht den höchsten)
  let minPenalty = null;
  let minReason  = null;
  for (const [level, cats] of Object.entries(matchedIntent.penalties)) {
    if (cats.includes(resolvedCategory)) {
      minPenalty = PENALTY_VALUES[level];
      minReason  = `${matchedIntent.name}_${level}_mismatch`;
      break;
    }
  }

  // Tags können Penalty reduzieren: wenn ein Tag in einer niedrigeren Penalty-Stufe liegt
  if (minPenalty !== null && itemTags.length > 0) {
    for (const [level, cats] of Object.entries(matchedIntent.penalties)) {
      if (itemTags.some(tag => cats.includes(tag))) {
        const tagPenalty = PENALTY_VALUES[level];
        if (tagPenalty < minPenalty) {
          minPenalty = tagPenalty;
          minReason  = `${matchedIntent.name}_${level}_mismatch_via_tag`;
        }
      }
    }
  }

  if (minPenalty !== null) {
    return { penalty: minPenalty, reason: minReason, resolvedCategory };
  }

  return { penalty: 0, reason: 'category_not_in_penalty_list', resolvedCategory };
}

module.exports = { getCategoryPenalty };