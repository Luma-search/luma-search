// support_list.js — Erweiterte Firmendatenbank mit ~80 Unternehmen
// Format: key (Suchwort) → { name, aliases, phone, hours, website, info }

const support_data = {

  // ── Telekommunikation ──────────────────────────────────────────────────
  'telekom': {
    name: 'Deutsche Telekom',
    aliases: ['telekom', 'dt telekom', 't-mobile', 'magenta', 'telecom'],
    phone: '0800 330 1000',
    hours: 'Mo–Fr 7–22 Uhr, Sa–So 8–18 Uhr',
    website: 'telekom.de',
    info: 'Mobilfunk, Festnetz & Internet Kundenservice'
  },
  'vodafone': {
    name: 'Vodafone',
    aliases: ['vodafone', 'kabel deutschland', 'unitymedia'],
    phone: '0800 172 1212',
    hours: 'Mo–Fr 8–22 Uhr, Sa 8–18 Uhr',
    website: 'vodafone.de',
    info: 'Mobilfunk, DSL & Kabel Kundenservice'
  },
  'o2': {
    name: 'O2 (Telefónica)',
    aliases: ['o2', 'o 2', 'telefonica', 'telefónica', 'blau'],
    phone: '0800 120 7000',
    hours: 'Mo–So 7–24 Uhr',
    website: 'o2online.de',
    info: 'Mobilfunk & Internet Kundenservice'
  },
  '1und1': {
    name: '1&1',
    aliases: ['1und1', '1&1', '1 und 1', 'ionos'],
    phone: '0721 9600 0',
    hours: 'Mo–Fr 7–23 Uhr, Sa–So 8–22 Uhr',
    website: '1und1.de',
    info: 'DSL, Mobilfunk & Hosting Support'
  },
  'eplus': {
    name: 'E-Plus / BASE',
    aliases: ['eplus', 'e-plus', 'base', 'yourfone'],
    phone: '01805 000 200',
    hours: 'Mo–Sa 8–22 Uhr',
    website: 'eplus.de',
    info: 'Mobilfunk Kundenservice'
  },
  'congstar': {
    name: 'congstar',
    aliases: ['congstar', 'cong star'],
    phone: '0221 79700 700',
    hours: 'Mo–Fr 8–22 Uhr, Sa 8–19 Uhr',
    website: 'congstar.de',
    info: 'Günstige Telekom-Tochter Mobilfunkverträge'
  },

  // ── Versand & Logistik ─────────────────────────────────────────────────
  'dhl': {
    name: 'DHL',
    aliases: ['dhl', 'dhl paket', 'deutsche post', 'post'],
    phone: '0228 902 43513',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'dhl.de',
    info: 'Paketversand, Tracking & Retouren'
  },
  'hermes': {
    name: 'Hermes',
    aliases: ['hermes', 'hermes paket', 'hermespaket'],
    phone: '0180 532 52 80',
    hours: 'Mo–Sa 8–20 Uhr',
    website: 'myhermes.de',
    info: 'Paketversand & Abholstationen'
  },
  'dpd': {
    name: 'DPD',
    aliases: ['dpd', 'd-p-d'],
    phone: '0800 177 2800',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'dpd.de',
    info: 'Paketservice & Abholstationen'
  },
  'ups': {
    name: 'UPS',
    aliases: ['ups', 'united parcel service'],
    phone: '01806 882 663',
    hours: 'Mo–Fr 8–20 Uhr, Sa 8–14 Uhr',
    website: 'ups.com/de',
    info: 'Paket- & Expresslieferungen'
  },
  'fedex': {
    name: 'FedEx',
    aliases: ['fedex', 'fed ex', 'federal express'],
    phone: '0800 123 8000',
    hours: 'Mo–Fr 8–19 Uhr',
    website: 'fedex.com/de',
    info: 'Express-Paketdienst & Tracking'
  },
  'gls': {
    name: 'GLS',
    aliases: ['gls', 'general logistics systems'],
    phone: '0611 910 900',
    hours: 'Mo–Fr 7:30–18 Uhr',
    website: 'gls-pakete.de',
    info: 'Paketversand & Geschäftskunden'
  },

  // ── E-Commerce & Shopping ──────────────────────────────────────────────
  'amazon': {
    name: 'Amazon',
    aliases: ['amazon', 'amazon.de', 'prime', 'amazon prime'],
    phone: '0800 363 8469',
    hours: 'Mo–So 24/7 (Rückruf)',
    website: 'amazon.de',
    info: 'Online-Shopping, Rückgaben & Prime Support'
  },
  'zalando': {
    name: 'Zalando',
    aliases: ['zalando', 'zalan', 'zalando lounge'],
    phone: '030 2000 2964',
    hours: 'Mo–Fr 8–20 Uhr, Sa 8–18 Uhr',
    website: 'zalando.de',
    info: 'Mode, Schuhe & Retouren Service'
  },
  'otto': {
    name: 'OTTO',
    aliases: ['otto', 'otto versand', 'otto.de'],
    phone: '040 3603 3603',
    hours: 'Mo–Fr 8–20 Uhr, Sa 8–16 Uhr',
    website: 'otto.de',
    info: 'Versandhandel & Ratenkauf Service'
  },
  'ebay': {
    name: 'eBay',
    aliases: ['ebay', 'e-bay', 'ebay kleinanzeigen'],
    phone: '0800 000 3229',
    hours: 'Mo–Fr 9–17 Uhr',
    website: 'ebay.de',
    info: 'Kaufen & Verkaufen, Streitbeilegung'
  },
  'mediamarkt': {
    name: 'MediaMarkt',
    aliases: ['mediamarkt', 'media markt', 'media saturn'],
    phone: '0800 723 6424',
    hours: 'Mo–Sa 9–20 Uhr',
    website: 'mediamarkt.de',
    info: 'Elektronik & Technik Kundenservice'
  },
  'saturn': {
    name: 'Saturn',
    aliases: ['saturn', 'saturn saturn'],
    phone: '0800 723 6424',
    hours: 'Mo–Sa 9–20 Uhr',
    website: 'saturn.de',
    info: 'Elektronik & Technik Kundenservice'
  },
  'about you': {
    name: 'About You',
    aliases: ['about you', 'aboutyou'],
    phone: '040 638 568 90',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'aboutyou.de',
    info: 'Mode & Fashion Online-Shop'
  },

  // ── Banken & Finanzen ──────────────────────────────────────────────────
  'sparkasse': {
    name: 'Sparkasse',
    aliases: ['sparkasse', 'haspa', 'berliner sparkasse'],
    phone: '116 116',
    hours: 'Mo–So 24/7 (Sperr-Notruf)',
    website: 'sparkasse.de',
    info: 'Zentraler Sperr-Notruf, Girokonto & Banking'
  },
  'commerzbank': {
    name: 'Commerzbank',
    aliases: ['commerzbank', 'comdirect', 'commerz bank'],
    phone: '069 1362 0',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'commerzbank.de',
    info: 'Girokonto, Kreditkarten & Wertpapiere'
  },
  'deutsche bank': {
    name: 'Deutsche Bank',
    aliases: ['deutsche bank', 'db bank', 'postbank'],
    phone: '069 910 00',
    hours: 'Mo–Fr 8–20 Uhr',
    website: 'deutsche-bank.de',
    info: 'Privat- und Geschäftskunden Banking'
  },
  'ing': {
    name: 'ING',
    aliases: ['ing', 'ing diba', 'ing-diba'],
    phone: '069 50 500 9009',
    hours: 'Mo–So 24/7',
    website: 'ing.de',
    info: 'Direktbank: Konto, Kredit, Depot'
  },
  'dkb': {
    name: 'DKB (Deutsche Kreditbank)',
    aliases: ['dkb', 'deutsche kreditbank'],
    phone: '030 1203 5616',
    hours: 'Mo–Fr 7–20 Uhr, Sa 8–16 Uhr',
    website: 'dkb.de',
    info: 'Kostenloses Girokonto & Kreditkarte'
  },
  'n26': {
    name: 'N26',
    aliases: ['n26', 'number26', 'n 26'],
    phone: '030 920 388 960',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'n26.com',
    info: 'Smartphone-Bank & Konto'
  },
  'paypal': {
    name: 'PayPal',
    aliases: ['paypal', 'pay pal', 'pp'],
    phone: '0800 723 4500',
    hours: 'Mo–Fr 8–21 Uhr, Sa 8–18 Uhr',
    website: 'paypal.de',
    info: 'Online-Zahlung, Käuferschutz & Rückerstattung'
  },
  'klarna': {
    name: 'Klarna',
    aliases: ['klarna', 'sofort', 'sofortüberweisung'],
    phone: '0221 669 501 00',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'klarna.de',
    info: 'Ratenzahlung, Rechnungskauf & Stripe'
  },

  // ── Versicherungen ─────────────────────────────────────────────────────
  'allianz': {
    name: 'Allianz',
    aliases: ['allianz', 'allianz versicherung'],
    phone: '089 3800 0',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'allianz.de',
    info: 'KFZ-, Haftpflicht- & Lebensversicherung'
  },
  'aok': {
    name: 'AOK',
    aliases: ['aok', 'allgemeine ortskrankenkasse'],
    phone: '0800 265 0800',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'aok.de',
    info: 'Gesetzliche Krankenversicherung'
  },
  'tk': {
    name: 'Techniker Krankenkasse (TK)',
    aliases: ['tk', 'techniker krankenkasse', 'techniker kasse'],
    phone: '0800 285 0606',
    hours: 'Mo–So 24/7',
    website: 'tk.de',
    info: 'Gesetzliche Krankenversicherung'
  },
  'barmer': {
    name: 'BARMER',
    aliases: ['barmer', 'barmer gek'],
    phone: '0800 333 1010',
    hours: 'Mo–Fr 7–22 Uhr, Sa 8–18 Uhr',
    website: 'barmer.de',
    info: 'Gesetzliche Krankenversicherung'
  },
  'huk coburg': {
    name: 'HUK-COBURG',
    aliases: ['huk', 'huk coburg', 'huk-coburg'],
    phone: '0800 214 1414',
    hours: 'Mo–Fr 7:30–18 Uhr',
    website: 'huk.de',
    info: 'KFZ- & Haftpflichtversicherung'
  },
  'ergo': {
    name: 'ERGO Versicherung',
    aliases: ['ergo', 'ergo versicherung', 'dkv'],
    phone: '0211 477 0',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'ergo.de',
    info: 'Lebens-, Kranken- & Sachversicherung'
  },

  // ── Streaming & Entertainment ──────────────────────────────────────────
  'netflix': {
    name: 'Netflix',
    aliases: ['netflix', 'net flix', 'netflix.com'],
    phone: '0800 724 0963',
    hours: 'Mo–So 24/7',
    website: 'netflix.com',
    info: 'Streaming-Support & Aboprobleme'
  },
  'disney plus': {
    name: 'Disney+',
    aliases: ['disney', 'disney+', 'disney plus', 'disneyplus'],
    phone: '0800 724 2352',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'disneyplus.com',
    info: 'Streaming-Support & Aktivierung'
  },
  'amazon prime': {
    name: 'Amazon Prime Video',
    aliases: ['prime video', 'amazon prime video', 'prime'],
    phone: '0800 363 8469',
    hours: 'Mo–So 24/7',
    website: 'amazon.de/primevideo',
    info: 'Streaming & Prime-Mitgliedschaft'
  },
  'sky': {
    name: 'Sky Deutschland',
    aliases: ['sky', 'sky go', 'sky ticket', 'skyde'],
    phone: '0899 727 900',
    hours: 'Mo–Fr 8–20 Uhr, Sa 9–18 Uhr',
    website: 'sky.de',
    info: 'TV-Abo, Streaming & Kündigung'
  },
  'spotify': {
    name: 'Spotify',
    aliases: ['spotify', 'spot ify'],
    phone: 'Kein Telefon – Chat-Support',
    hours: 'Mo–Fr 9–18 Uhr (Chat)',
    website: 'support.spotify.com',
    info: 'Musik-Streaming, Abo & Abrechnung'
  },
  'apple': {
    name: 'Apple Support',
    aliases: ['apple', 'apple support', 'iphone', 'ipad', 'mac', 'itunes'],
    phone: '0800 664 5451',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'support.apple.com',
    info: 'iPhone, Mac, iPad & iCloud Support'
  },

  // ── Tech & Software ────────────────────────────────────────────────────
  'microsoft': {
    name: 'Microsoft Support',
    aliases: ['microsoft', 'windows', 'office', 'outlook', 'xbox', 'ms'],
    phone: '0800 2848 283',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'support.microsoft.com',
    info: 'Windows, Office 365, Xbox & Azure'
  },
  'google': {
    name: 'Google Support',
    aliases: ['google', 'gmail', 'android', 'chrome', 'google play', 'pixel'],
    phone: '0800 589 0571',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'support.google.com',
    info: 'Gmail, Drive, Play Store & Android'
  },
  'samsung': {
    name: 'Samsung',
    aliases: ['samsung', 'galaxy', 'samsung galaxy'],
    phone: '0800 726 7864',
    hours: 'Mo–So 8–22 Uhr',
    website: 'samsung.com/de',
    info: 'Smartphones, TVs & Haushaltsgeräte'
  },

  // ── Energie & Versorger ────────────────────────────────────────────────
  'eon': {
    name: 'E.ON',
    aliases: ['eon', 'e.on', 'e on'],
    phone: '0800 204 0040',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'eon.de',
    info: 'Strom, Gas & Energieberatung'
  },
  'rwe': {
    name: 'RWE',
    aliases: ['rwe', 'r.w.e', 'innogy'],
    phone: '0800 555 7777',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'rwe.com',
    info: 'Strom & Gas Kundenservice'
  },
  'vattenfall': {
    name: 'Vattenfall',
    aliases: ['vattenfall', 'vatenfall'],
    phone: '0800 000 1000',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'vattenfall.de',
    info: 'Strom & Fernwärme Berlin/Hamburg'
  },
  'enbw': {
    name: 'EnBW',
    aliases: ['enbw', 'en bw', 'yippie'],
    phone: '0800 362 1000',
    hours: 'Mo–Fr 8–20 Uhr, Sa 9–14 Uhr',
    website: 'enbw.com',
    info: 'Strom, Gas & Telekommunikation'
  },

  // ── Reise & Transport ──────────────────────────────────────────────────
  'deutsche bahn': {
    name: 'Deutsche Bahn',
    aliases: ['db', 'deutsche bahn', 'bahn', 'db bahn', 'db regio', 'ice'],
    phone: '030 2970',
    hours: 'Mo–So 6–22 Uhr',
    website: 'bahn.de',
    info: 'Zuginformationen, Tickets & Verspätungen'
  },
  'lufthansa': {
    name: 'Lufthansa',
    aliases: ['lufthansa', 'lh', 'eurowings', 'austrian'],
    phone: '069 867 998 00',
    hours: 'Mo–So 24/7',
    website: 'lufthansa.com',
    info: 'Flugbuchung, Umbuchung & Gepäck'
  },
  'ryanair': {
    name: 'Ryanair',
    aliases: ['ryanair', 'ryan air'],
    phone: '0900 1 16 0 302',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'ryanair.com',
    info: 'Billigflüge & Buchungsänderungen'
  },
  'easyjet': {
    name: 'easyJet',
    aliases: ['easyjet', 'easy jet'],
    phone: '0800 000 3654',
    hours: 'Mo–Fr 8–20 Uhr',
    website: 'easyjet.com',
    info: 'Flugbuchung & Gepäckservice'
  },
  'booking': {
    name: 'Booking.com',
    aliases: ['booking', 'booking.com', 'bookingcom'],
    phone: '0800 000 4748',
    hours: 'Mo–So 24/7',
    website: 'booking.com',
    info: 'Hotel- & Unterkunftsbuchungen'
  },
  'airbnb': {
    name: 'Airbnb',
    aliases: ['airbnb', 'air bnb', 'airb&b'],
    phone: '0800 100 2007',
    hours: 'Mo–So 24/7',
    website: 'airbnb.de',
    info: 'Ferienwohnung & Unterkunft'
  },
  'adac': {
    name: 'ADAC',
    aliases: ['adac', 'a.d.a.c.'],
    phone: '0800 510 1112',
    hours: 'Mo–So 24/7 (Pannenhilfe)',
    website: 'adac.de',
    info: 'Pannenhilfe, Mitgliedschaft & Reise'
  },

  // ── Behörden & Öffentliche Stellen ────────────────────────────────────
  'finanzamt': {
    name: 'Finanzamt',
    aliases: ['finanzamt', 'steuerbehörde', 'finanzbehörde', 'steuern'],
    phone: '0800 522 5354',
    hours: 'Mo–Fr 8–16 Uhr',
    website: 'finanzamt.de',
    info: 'Steuerauskunft & Elster-Support'
  },
  'bundesagentur': {
    name: 'Bundesagentur für Arbeit',
    aliases: ['bundesagentur', 'arbeitsamt', 'bundesagentur arbeit', 'aba', 'ba'],
    phone: '0800 455 5500',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'arbeitsagentur.de',
    info: 'Arbeitslosengeld, Jobcenter & Ausbildung'
  },
  'jobcenter': {
    name: 'Jobcenter / Grundsicherung',
    aliases: ['jobcenter', 'job center', 'buergergeld', 'bürgergeld', 'hartz'],
    phone: '0800 455 5500',
    hours: 'Mo–Fr 8–16 Uhr',
    website: 'jobcenter.digital',
    info: 'Bürgergeld, Vermittlung & Beratung'
  },
  'bafin': {
    name: 'BaFin',
    aliases: ['bafin', 'ba fin', 'bundesanstalt finanzdienstleistungsaufsicht'],
    phone: '0228 299 70 299',
    hours: 'Mo–Fr 9–17 Uhr',
    website: 'bafin.de',
    info: 'Finanzaufsicht & Verbraucherschutz'
  },

  // ── Lebensmittel & Handel ──────────────────────────────────────────────
  'aldi': {
    name: 'ALDI',
    aliases: ['aldi', 'aldi nord', 'aldi süd', 'aldi south'],
    phone: '0800 800 2534',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'aldi.de',
    info: 'Kundenservice & Reklamationen'
  },
  'lidl': {
    name: 'Lidl',
    aliases: ['lidl', 'lidl.de', 'lidl shop'],
    phone: '0800 435 3361',
    hours: 'Mo–Fr 8–20 Uhr, Sa 8–16 Uhr',
    website: 'lidl.de',
    info: 'Reklamationen & Online-Shop Bestellungen'
  },
  'rewe': {
    name: 'REWE',
    aliases: ['rewe', 'rewe lieferservice', 'rewe.de'],
    phone: '0800 111 555 4',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'rewe.de',
    info: 'Online-Bestellungen & Lieferservice'
  },
  'dm': {
    name: 'dm Drogeriemarkt',
    aliases: ['dm', 'dm drogerie', 'dm markt'],
    phone: '0800 365 8543',
    hours: 'Mo–Fr 8–18 Uhr',
    website: 'dm.de',
    info: 'Online-Shop & Reklamationen'
  },
  'ikea': {
    name: 'IKEA',
    aliases: ['ikea', 'i k e a', 'ikea.de'],
    phone: '06192 939 9999',
    hours: 'Mo–Fr 8–20 Uhr, Sa 10–18 Uhr',
    website: 'ikea.de',
    info: 'Möbel-Bestellungen & Montageservice'
  },

  // ── Automobil ──────────────────────────────────────────────────────────
  'tesla': {
    name: 'Tesla',
    aliases: ['tesla', 'tesla motors', 'tesla service'],
    phone: '0800 827 3726',
    hours: 'Mo–Fr 9–18 Uhr',
    website: 'tesla.com/de',
    info: 'Fahrzeug-Support & Pannenhilfe'
  },
  'volkswagen': {
    name: 'Volkswagen',
    aliases: ['vw', 'volkswagen', 'vw service'],
    phone: '0800 865 6727',
    hours: 'Mo–Fr 7:30–22 Uhr, Sa 9–18 Uhr',
    website: 'volkswagen.de',
    info: 'Fahrzeug-Support & Händlersuche'
  },
  'bmw': {
    name: 'BMW',
    aliases: ['bmw', 'b.m.w.', 'bmw service'],
    phone: '0800 999 7777',
    hours: 'Mo–Fr 7–22 Uhr, Sa–So 9–18 Uhr',
    website: 'bmw.de',
    info: 'Fahrzeug-Support & Pannenhilfe'
  },
  'mercedes': {
    name: 'Mercedes-Benz',
    aliases: ['mercedes', 'mercedes-benz', 'daimler', 'benz'],
    phone: '0800 773 7363',
    hours: 'Mo–Fr 7–22 Uhr, Sa–So 9–18 Uhr',
    website: 'mercedes-benz.de',
    info: 'Fahrzeug-Support & Rückruf-Aktion'
  },
  'opel': {
    name: 'Opel',
    aliases: ['opel', 'opel vauxhall', 'peugeot opel'],
    phone: '0800 027 3524',
    hours: 'Mo–Fr 8–17 Uhr',
    website: 'opel.de',
    info: 'Fahrzeug-Support & Pannenhilfe'
  },

  // ── Diverses & Plattformen ─────────────────────────────────────────────
  'check24': {
    name: 'CHECK24',
    aliases: ['check24', 'check 24'],
    phone: '089 2424 1234',
    hours: 'Mo–Fr 8–20 Uhr, Sa 9–17 Uhr',
    website: 'check24.de',
    info: 'Vergleiche für Versicherungen, Kredite & Strom'
  },
  'verivox': {
    name: 'Verivox',
    aliases: ['verivox', 'veri vox'],
    phone: '0800 100 0889',
    hours: 'Mo–Fr 8–20 Uhr, Sa 9–17 Uhr',
    website: 'verivox.de',
    info: 'Preisvergleich Energie, Mobilfunk & Finanzen'
  },
  'lieferando': {
    name: 'Lieferando',
    aliases: ['lieferando', 'just eat', 'lieferservice'],
    phone: '030 22032200',
    hours: 'Mo–Fr 8–24 Uhr, Sa–So 11–24 Uhr',
    website: 'lieferando.de',
    info: 'Essenslieferung & Stornierungen'
  },
  'ebay kleinanzeigen': {
    name: 'Kleinanzeigen (ehem. eBay Kleinanzeigen)',
    aliases: ['kleinanzeigen', 'ebay kleinanzeigen', 'ka'],
    phone: 'Kein Telefon – Online-Support',
    hours: 'Mo–Fr 9–17 Uhr (Chat)',
    website: 'kleinanzeigen.de',
    info: 'Anzeigen aufgeben & Konto-Support'
  },

};

module.exports = support_data;
