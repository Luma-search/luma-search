/**
 * Luma Autocomplete – Thesaurus-Daten
 * Verwandte Suchbegriffe für die /related_autocomplete Route.
 */

'use strict';

const thesaurus = {
    // Hardware & Tech
    'gpu':             ['Grafikkarte', 'Nvidia', 'AMD', 'RTX', 'Radeon'],
    'grafikkarte':     ['GPU', 'Nvidia', 'AMD', 'RTX 4090', 'Radeon RX'],
    'cpu':             ['Prozessor', 'Intel', 'AMD', 'Ryzen', 'Core i9'],
    'prozessor':       ['CPU', 'Intel', 'AMD', 'Ryzen 7', 'Core i7'],
    'ram':             ['Arbeitsspeicher', 'DDR5', 'DDR4', 'Speicher', '32GB'],
    'arbeitsspeicher': ['RAM', 'DDR5', 'DDR4', '16GB', '32GB'],
    'ssd':             ['Festplatte', 'NVMe', 'M.2', 'Speicher', 'Samsung'],
    'festplatte':      ['SSD', 'HDD', 'NVMe', 'Speicher', 'Seagate'],
    'laptop':          ['Notebook', 'MacBook', 'Ultrabook', 'Gaming Laptop'],
    'notebook':        ['Laptop', 'MacBook', 'Ultrabook', 'PC', 'Computer'],
    'pc':              ['Computer', 'Desktop', 'Gaming PC', 'Tower', 'Workstation'],
    'computer':        ['PC', 'Laptop', 'Mac', 'Desktop', 'Workstation'],
    'monitor':         ['Bildschirm', '4K', 'Gaming Monitor', 'IPS', 'OLED'],
    'bildschirm':      ['Monitor', '4K', 'UHD', 'IPS Panel', 'Curved'],
    'tastatur':        ['Keyboard', 'Mechanisch', 'Gaming Tastatur', 'Cherry MX'],
    'maus':            ['Mouse', 'Gaming Maus', 'Logitech', 'Razer', 'Wireless'],
    'handy':           ['Smartphone', 'iPhone', 'Android', 'Samsung', 'Pixel'],
    'smartphone':      ['Handy', 'iPhone', 'Samsung Galaxy', 'Android', 'Pixel'],
    'iphone':          ['Apple', 'iOS', 'Smartphone', 'Samsung', 'MacBook'],
    'samsung':         ['Galaxy', 'Android', 'Smartphone', 'iPhone', 'Tablet'],
    'kopfhörer':       ['Headphones', 'Headset', 'In-Ear', 'Over-Ear', 'Sony'],
    'headset':         ['Kopfhörer', 'Gaming Headset', 'Mikrofon', 'Wireless'],
    'drucker':         ['Tintenstrahldrucker', 'Laserdrucker', 'HP', 'Canon', 'Brother'],
    'router':          ['WLAN', 'Wifi', 'Netzwerk', 'FritzBox', 'Mesh'],
    'wlan':            ['WLAN Router', 'WiFi', 'Netzwerk', 'Internet', 'FritzBox'],
    'akku':            ['Batterie', 'Powerbank', 'Ladegerät', 'mAh', 'USB-C'],
    'powerbank':       ['Akku', 'Ladegerät', 'Batterie', 'USB-C', '20000mAh'],
    // Kleidung & Mode
    't-shirt':         ['Shirt', 'Oberteil', 'Polo', 'Hoodie', 'Merch'],
    'shirt':           ['T-Shirt', 'Oberteil', 'Polo', 'Top', 'Hemd'],
    'hoodie':          ['Pullover', 'Sweatshirt', 'Kapuzenpullover', 'Jacke'],
    'pullover':        ['Hoodie', 'Sweatshirt', 'Strickpullover', 'Sweater'],
    'hose':            ['Jeans', 'Chino', 'Jogginghose', 'Leggings', 'Shorts'],
    'jeans':           ['Hose', 'Denim', 'Slim Fit', 'Levi\'s', 'Wrangler'],
    'schuhe':          ['Sneaker', 'Boots', 'Sandalen', 'Turnschuhe', 'Nike'],
    'sneaker':         ['Schuhe', 'Nike', 'Adidas', 'Puma', 'New Balance'],
    'jacke':           ['Mantel', 'Winterjacke', 'Softshell', 'Parka', 'Fleece'],
    'kleidung':        ['Mode', 'Fashion', 'Outfit', 'Klamotten', 'Style'],
    'mode':            ['Kleidung', 'Fashion', 'Outfit', 'Trend', 'Style'],
    // Gaming
    'gaming':          ['PC Gaming', 'Konsole', 'PS5', 'Xbox', 'Nintendo Switch'],
    'ps5':             ['PlayStation 5', 'Sony', 'Konsole', 'Xbox', 'Gaming'],
    'xbox':            ['Microsoft', 'Konsole', 'Game Pass', 'PS5', 'Gaming'],
    'nintendo':        ['Switch', 'Mario', 'Zelda', 'Pokemon', 'Konsole'],
    'minecraft':       ['Gaming', 'Java Edition', 'Bedrock', 'Mods', 'Server'],
    // Autos & Transport
    'auto':            ['KFZ', 'Fahrzeug', 'PKW', 'Wagen', 'Elektroauto'],
    'kfz':             ['Auto', 'PKW', 'Fahrzeug', 'Motorrad', 'Kraftfahrzeug'],
    'elektroauto':     ['Tesla', 'EV', 'Elektrisch', 'Laden', 'Reichweite'],
    'tesla':           ['Elektroauto', 'Model 3', 'Model S', 'EV', 'Autopilot'],
    'fahrrad':         ['Bike', 'E-Bike', 'Rennrad', 'MTB', 'Mountainbike'],
    'e-bike':          ['Elektrofahrrad', 'Fahrrad', 'Pedelec', 'Akku', 'Motor'],
    // Kochen & Rezepte
    'rezept':          ['Kochen', 'Zubereitung', 'Zutaten', 'Backen', 'Küche'],
    'kochen':          ['Rezept', 'Zubereitung', 'Küche', 'Backen', 'Ernährung'],
    'backen':          ['Rezept', 'Kuchen', 'Brot', 'Teig', 'Kochen'],
    'pizza':           ['Rezept', 'Teig', 'Belag', 'Ofen', 'Italienisch'],
    'pasta':           ['Nudeln', 'Spaghetti', 'Sauce', 'Italienisch', 'Rezept'],
    // Musik
    'musik':           ['Songs', 'Spotify', 'YouTube Music', 'Playlist', 'Künstler'],
    'spotify':         ['Musik', 'Playlist', 'Podcast', 'Apple Music', 'Streaming'],
    'youtube':         ['Video', 'Streaming', 'Kanal', 'Shorts', 'Vlog'],
    // Programmierung
    'javascript':      ['JS', 'TypeScript', 'Node.js', 'React', 'Vue.js'],
    'python':          ['Programmierung', 'ML', 'AI', 'Django', 'Flask'],
    'react':           ['JavaScript', 'Frontend', 'Vue.js', 'Angular', 'Next.js'],
    'typescript':      ['JavaScript', 'JS', 'Angular', 'React', 'Node.js'],
    'api':             ['REST API', 'Endpoint', 'JSON', 'HTTP', 'Backend'],
    'ki':              ['KI', 'ChatGPT', 'Gemini', 'AI', 'Machine Learning'],
    'chatgpt':         ['KI', 'OpenAI', 'GPT-4', 'Claude', 'AI'],
    'ai':              ['Künstliche Intelligenz', 'Machine Learning', 'ChatGPT', 'Claude', 'Gemini'],
    // Sport & Fitness
    'fitness':         ['Sport', 'Gym', 'Training', 'Workout', 'Ernährung'],
    'sport':           ['Fitness', 'Training', 'Workout', 'Gesundheit', 'Gym'],
    'fußball':         ['Bundesliga', 'Champions League', 'FIFA', 'Tor', 'Spieler'],
    'gym':             ['Fitness', 'Krafttraining', 'Supplement', 'Protein', 'Sport'],
    // Reisen
    'urlaub':          ['Reise', 'Ferien', 'Flug', 'Hotel', 'Strand'],
    'reise':           ['Urlaub', 'Ferien', 'Flug', 'Hotel', 'Backpacking'],
    'hotel':           ['Unterkunft', 'Booking', 'Airbnb', 'Resort', 'Reise'],
    'flug':            ['Airline', 'Flughafen', 'Ticket', 'Ryanair', 'Lufthansa'],
    // Allgemein
    'wetter':          ['Temperatur', 'Forecast', 'Niederschlag', 'Klima', 'Regen'],
    'nachrichten':     ['News', 'Aktuell', 'Heute', 'Schlagzeilen', 'Tagesschau'],
    'news':            ['Nachrichten', 'Aktuell', 'Schlagzeilen', 'Heute', 'Breaking'],
    'definition':      ['Bedeutung', 'Erklärung', 'Was ist', 'Lexikon', 'Wikipedia'],
    'anleitung':       ['Tutorial', 'Howto', 'Schritt für Schritt', 'Guide', 'Erklärung'],
};

module.exports = thesaurus;
