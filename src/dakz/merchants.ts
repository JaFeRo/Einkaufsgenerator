import { MERCHANT } from './scenarios';
import type { Merchant, Position } from './types';

/**
 * Fiktive Testhändler für den Demo-Modus („Kasse“). Namen, Anschriften und Nummern sind erfunden.
 * Artikeltexte bleiben in ISO 8859-1 darstellbar (Fassung 1.3): Umlaute und ß ja, kein €-Zeichen,
 * keine typografischen Anführungszeichen oder Gedankenstriche.
 */
export interface DemoItem {
  id: string;
  text: string;
  /** Preis je Stück bzw. je kg in Euro */
  price: number;
  vat: 7 | 19;
  category: string;
  unit?: 'kg';
  /** P3 = 0, z. B. Dienstleistungen */
  refundable?: boolean;
}

export interface DemoBasket {
  label: string;
  lines: { item: string; qty: number }[];
}

export interface DemoMerchant extends Merchant {
  id: string;
  city: string;
  slogan: string;
  /** Fußzeilen des Bons, z. B. Dank und Öffnungszeiten */
  footer: string[];
  /** Akzentfarbe der Kassenoberfläche */
  color: string;
  initials: string;
  items: DemoItem[];
  baskets: DemoBasket[];
}

const it = (id: string, text: string, price: number, vat: 7 | 19, category: string, extra: Partial<DemoItem> = {}): DemoItem => ({ id, text, price, vat, category, ...extra });

export const DEMO_MERCHANTS: DemoMerchant[] = [
  {
    ...MERCHANT,
    id: 'kaufhaus',
    city: 'Konstanz',
    slogan: 'Ihr Kaufhaus an der Grenze',
    footer: ['Vielen Dank für Ihren Einkauf!', 'Mo-Sa 9:30-20:00 Uhr'],
    color: '#0d6a4a',
    initials: 'KR',
    items: [
      it('uhr', 'Uhr Chronograph Edelstahl', 289.0, 19, 'Uhren'),
      it('pullover', 'Kaschmir-Pullover', 149.95, 19, 'Bekleidung'),
      it('kopfhoerer', 'Kopfhörer Noise Cancelling', 249.0, 19, 'Elektronik'),
      it('edt', 'Eau de Toilette 100 ml', 89.9, 19, 'Kosmetik'),
      it('creme', 'Gesichtscreme 50 ml', 34.95, 19, 'Kosmetik'),
      it('laufschuhe', 'Laufschuhe Trail', 129.99, 19, 'Bekleidung'),
      it('handtasche', 'Lederhandtasche', 219.0, 19, 'Accessoires'),
      it('sonnenbrille', 'Sonnenbrille', 159.0, 19, 'Accessoires'),
      it('huelle', 'Smartphone-Hülle Leder', 39.99, 19, 'Accessoires'),
      it('espresso', 'Espressomaschine', 399.0, 19, 'Haushalt'),
      it('messer', 'Messerset 5-tlg.', 119.0, 19, 'Haushalt'),
      it('riesling', 'Riesling Spätlese 0,75 l', 11.9, 19, 'Lebensmittel'),
      it('kaffee', 'Kaffee Bohnen 1 kg', 16.99, 7, 'Lebensmittel'),
      it('pralinen', 'Pralinen-Box', 9.95, 7, 'Lebensmittel'),
      it('schinken', 'Schwarzwälder Schinken', 32.5, 7, 'Lebensmittel', { unit: 'kg' }),
      it('bergkaese', 'Bergkäse am Stück', 24.9, 7, 'Lebensmittel', { unit: 'kg' }),
      it('kinderbuch', 'Kinderbuch', 14.0, 7, 'Bücher'),
      it('bildband', 'Bildband Bodensee', 39.9, 7, 'Bücher'),
      it('verpackung', 'Geschenkverpackung', 2.5, 19, 'Service', { refundable: false })
    ],
    baskets: [
      { label: 'Kopfhörer und Kosmetik', lines: [{ item: 'kopfhoerer', qty: 1 }, { item: 'edt', qty: 1 }, { item: 'creme', qty: 2 }, { item: 'verpackung', qty: 1 }] },
      { label: 'Mitbringsel vom Bodensee', lines: [{ item: 'bildband', qty: 1 }, { item: 'pralinen', qty: 3 }, { item: 'bergkaese', qty: 0.648 }, { item: 'riesling', qty: 2 }] }
    ]
  },
  {
    id: 'mode',
    name: 'Modehaus Seeblick',
    address: 'Maximilianstraße 12 · 88131 Lindau (Bodensee)',
    vatId: 'DE000000002',
    register: 'Kasse 3 · Filiale 02',
    city: 'Lindau',
    slogan: 'Mode mit Aussicht seit 1952',
    footer: ['Danke für Ihren Besuch!', 'Umtausch innerhalb von 14 Tagen mit Bon', 'Mo-Fr 10-19 Uhr, Sa 10-18 Uhr'],
    color: '#6b3fa0',
    initials: 'MS',
    items: [
      it('mantel', 'Wollmantel', 349.0, 19, 'Bekleidung'),
      it('trench', 'Trenchcoat', 289.0, 19, 'Bekleidung'),
      it('sakko', 'Sakko Schurwolle', 259.0, 19, 'Bekleidung'),
      it('bluse', 'Seidenbluse', 149.0, 19, 'Bekleidung'),
      it('merino', 'Strickpullover Merino', 119.0, 19, 'Bekleidung'),
      it('jeans', 'Jeans Slim Fit', 99.95, 19, 'Bekleidung'),
      it('hemd', 'Hemd Baumwolle', 69.95, 19, 'Bekleidung'),
      it('stiefel', 'Lederstiefel', 239.0, 19, 'Schuhe'),
      it('sneaker', 'Sneaker Leder', 139.0, 19, 'Schuhe'),
      it('schal', 'Kaschmirschal', 129.0, 19, 'Accessoires'),
      it('seidentuch', 'Seidentuch', 79.0, 19, 'Accessoires'),
      it('muetze', 'Mütze Kaschmir', 69.0, 19, 'Accessoires'),
      it('handschuhe', 'Lederhandschuhe', 59.9, 19, 'Accessoires'),
      it('guertel', 'Ledergürtel', 49.95, 19, 'Accessoires'),
      it('saum', 'Änderungsservice Saum', 15.0, 19, 'Service', { refundable: false })
    ],
    baskets: [
      { label: 'Winteroutfit', lines: [{ item: 'mantel', qty: 1 }, { item: 'schal', qty: 1 }, { item: 'stiefel', qty: 1 }] },
      { label: 'Jeans mit Änderung', lines: [{ item: 'jeans', qty: 2 }, { item: 'hemd', qty: 1 }, { item: 'saum', qty: 1 }] }
    ]
  },
  {
    id: 'elektro',
    name: 'Elektro Grenzland',
    address: 'Basler Straße 85 · 79540 Lörrach',
    vatId: 'DE000000003',
    register: 'Kasse 1 · Filiale 01',
    city: 'Lörrach',
    slogan: 'Technik, die ankommt',
    footer: ['Vielen Dank für Ihren Einkauf!', 'Garantie nur mit Kassenbon', 'Mo-Sa 9-20 Uhr'],
    color: '#1f5fbf',
    initials: 'EG',
    items: [
      it('laptop', 'Laptop 14 Zoll', 1099.0, 19, 'Computer'),
      it('tablet', 'Tablet 11 Zoll 128 GB', 549.0, 19, 'Computer'),
      it('ereader', 'E-Book-Reader', 139.0, 19, 'Computer'),
      it('kamera', 'Systemkamera', 899.0, 19, 'Foto'),
      it('objektiv', 'Objektiv 50 mm 1.8', 249.0, 19, 'Foto'),
      it('overear', 'Kopfhörer Over-Ear', 279.0, 19, 'Audio'),
      it('inear', 'In-Ear-Kopfhörer', 179.0, 19, 'Audio'),
      it('lautsprecher', 'Bluetooth-Lautsprecher', 129.0, 19, 'Audio'),
      it('smartwatch', 'Smartwatch', 329.0, 19, 'Wearables'),
      it('fitness', 'Fitnessarmband', 79.99, 19, 'Wearables'),
      it('speicher', 'Speicherkarte 128 GB', 29.99, 19, 'Zubehör'),
      it('kabel', 'Ladekabel USB-C 2 m', 19.99, 19, 'Zubehör'),
      it('powerbank', 'Powerbank 20.000 mAh', 49.99, 19, 'Zubehör'),
      it('zahnbuerste', 'Elektrische Zahnbürste', 89.99, 19, 'Haushalt'),
      it('garantie', 'Garantieverlängerung 2 Jahre', 49.0, 19, 'Service', { refundable: false })
    ],
    baskets: [
      { label: 'Kamera-Set', lines: [{ item: 'kamera', qty: 1 }, { item: 'objektiv', qty: 1 }, { item: 'speicher', qty: 2 }, { item: 'garantie', qty: 1 }] },
      { label: 'Kopfhörer und Zubehör', lines: [{ item: 'overear', qty: 1 }, { item: 'kabel', qty: 2 }, { item: 'powerbank', qty: 1 }] }
    ]
  },
  {
    id: 'parfuem',
    name: 'Parfümerie Lindenhof',
    address: 'Kaiser-Joseph-Straße 210 · 79098 Freiburg im Breisgau',
    vatId: 'DE000000004',
    register: 'Kasse 2 · Filiale 01',
    city: 'Freiburg im Breisgau',
    slogan: 'Duft und Pflege am Münsterplatz',
    footer: ['Schön, dass Sie da waren!', 'Mo-Sa 10-19 Uhr'],
    color: '#b03a6a',
    initials: 'PL',
    items: [
      it('edp50', 'Eau de Parfum 50 ml', 98.0, 19, 'Duft'),
      it('edp100', 'Eau de Parfum 100 ml', 145.0, 19, 'Duft'),
      it('edt100', 'Eau de Toilette 100 ml', 79.0, 19, 'Duft'),
      it('kerze', 'Duftkerze', 34.0, 19, 'Duft'),
      it('pflegeset', 'Pflegeset Gesicht', 64.9, 19, 'Pflege'),
      it('nachtcreme', 'Nachtcreme 50 ml', 54.0, 19, 'Pflege'),
      it('serum', 'Serum 30 ml', 69.0, 19, 'Pflege'),
      it('bodylotion', 'Bodylotion 200 ml', 29.95, 19, 'Pflege'),
      it('lippenstift', 'Lippenstift', 32.0, 19, 'Make-up'),
      it('mascara', 'Mascara', 27.5, 19, 'Make-up'),
      it('foundation', 'Foundation 30 ml', 42.0, 19, 'Make-up'),
      it('palette', 'Lidschattenpalette', 49.0, 19, 'Make-up'),
      it('nagellack', 'Nagellack', 18.9, 19, 'Make-up'),
      it('rasierer', 'Rasierer Nassrasur', 39.95, 19, 'Herren'),
      it('aftershave', 'Aftershave Balsam 100 ml', 45.0, 19, 'Herren')
    ],
    baskets: [
      { label: 'Duft und Pflege', lines: [{ item: 'edp50', qty: 1 }, { item: 'serum', qty: 1 }, { item: 'lippenstift', qty: 2 }] },
      { label: 'Für Ihn', lines: [{ item: 'edt100', qty: 1 }, { item: 'rasierer', qty: 1 }, { item: 'aftershave', qty: 1 }] }
    ]
  },
  {
    id: 'uhren',
    name: 'Uhren & Schmuck am Rheinufer',
    address: 'Hauptstraße 312 · 79576 Weil am Rhein',
    vatId: 'DE000000005',
    register: 'Kasse 1 · Filiale 01',
    city: 'Weil am Rhein',
    slogan: 'Meisterwerkstatt seit 1968',
    footer: ['Vielen Dank für Ihr Vertrauen!', 'Di-Sa 10-18 Uhr'],
    color: '#8a6a1c',
    initials: 'UR',
    items: [
      it('automatik', 'Automatikuhr Edelstahl', 1290.0, 19, 'Uhren'),
      it('chrono', 'Chronograph Titan', 1650.0, 19, 'Uhren'),
      it('taucher', 'Taucheruhr', 890.0, 19, 'Uhren'),
      it('quarz', 'Quarzuhr Damen', 349.0, 19, 'Uhren'),
      it('goldkette', 'Goldkette 585 45 cm', 789.0, 19, 'Schmuck'),
      it('ohrstecker', 'Ohrstecker Brillant 0,10 ct', 459.0, 19, 'Schmuck'),
      it('ring', 'Ring Weißgold', 650.0, 19, 'Schmuck'),
      it('perlen', 'Perlenkette', 399.0, 19, 'Schmuck'),
      it('anhaenger', 'Anhänger Herz Gold', 219.0, 19, 'Schmuck'),
      it('armband', 'Armband Silber 925', 129.0, 19, 'Schmuck'),
      it('uhrenarmband', 'Uhrenarmband Leder', 89.0, 19, 'Zubehör'),
      it('uhrenbox', 'Uhrenbox Holz', 149.0, 19, 'Zubehör'),
      it('gravur', 'Gravur', 25.0, 19, 'Service', { refundable: false })
    ],
    baskets: [
      { label: 'Uhr mit Gravur', lines: [{ item: 'automatik', qty: 1 }, { item: 'uhrenarmband', qty: 1 }, { item: 'gravur', qty: 1 }] },
      { label: 'Schmuckgeschenk', lines: [{ item: 'ohrstecker', qty: 1 }, { item: 'anhaenger', qty: 1 }] }
    ]
  },
  {
    id: 'feinkost',
    name: 'Feinkost Alpenblick',
    address: 'Ludwigstraße 41 · 82467 Garmisch-Partenkirchen',
    vatId: 'DE000000006',
    register: 'Kasse 1 · Filiale 01',
    city: 'Garmisch-Partenkirchen',
    slogan: 'Spezialitäten aus den Alpen',
    footer: ['Vergelt\'s Gott und guten Appetit!', 'Mo-Fr 8-18 Uhr, Sa 8-14 Uhr'],
    color: '#8c4a1f',
    initials: 'FA',
    items: [
      it('bergkaese', 'Bergkäse 12 Monate', 34.9, 7, 'Käse', { unit: 'kg' }),
      it('almkaese', 'Almkäse', 28.5, 7, 'Käse', { unit: 'kg' }),
      it('rohschinken', 'Rohschinken', 46.9, 7, 'Wurst', { unit: 'kg' }),
      it('salami', 'Hirschsalami 200 g', 9.9, 7, 'Wurst'),
      it('weisswurst', 'Weißwürste 4 Stück', 7.8, 7, 'Wurst'),
      it('honig', 'Bienenhonig 500 g', 11.5, 7, 'Feinkost'),
      it('tee', 'Bergkräutertee', 6.9, 7, 'Feinkost'),
      it('senf', 'Senf süß', 4.2, 7, 'Feinkost'),
      it('lebkuchen', 'Lebkuchen Dose', 14.9, 7, 'Süßes'),
      it('pralinen', 'Pralinen Enzian', 16.5, 7, 'Süßes'),
      it('weissbier', 'Weißbier 0,5 l', 2.4, 19, 'Getränke'),
      it('rotwein', 'Rotwein Lemberger 0,75 l', 14.9, 19, 'Getränke'),
      it('obstbrand', 'Obstbrand 0,5 l', 32.0, 19, 'Getränke'),
      it('kochbuch', 'Kochbuch Alpenküche', 29.9, 7, 'Bücher')
    ],
    baskets: [
      { label: 'Brotzeit-Paket', lines: [{ item: 'bergkaese', qty: 0.452 }, { item: 'rohschinken', qty: 0.318 }, { item: 'weisswurst', qty: 2 }, { item: 'senf', qty: 1 }, { item: 'weissbier', qty: 6 }] },
      { label: 'Geschenkkorb', lines: [{ item: 'honig', qty: 2 }, { item: 'lebkuchen', qty: 1 }, { item: 'obstbrand', qty: 1 }, { item: 'kochbuch', qty: 1 }] }
    ]
  },
  {
    id: 'sport',
    name: 'Sporthaus Hochfirst',
    address: 'Seestraße 18 · 79822 Titisee-Neustadt',
    vatId: 'DE000000007',
    register: 'Kasse 2 · Filiale 01',
    city: 'Titisee-Neustadt',
    slogan: 'Draußen zu Hause im Schwarzwald',
    footer: ['Viel Spaß beim Wandern!', 'Mo-Sa 9-19 Uhr'],
    color: '#2a7a8c',
    initials: 'SH',
    items: [
      it('wanderschuhe', 'Wanderschuhe GTX', 189.0, 19, 'Schuhe'),
      it('trailschuhe', 'Trailrunning-Schuhe', 149.0, 19, 'Schuhe'),
      it('skijacke', 'Skijacke', 349.0, 19, 'Bekleidung'),
      it('skihose', 'Skihose', 219.0, 19, 'Bekleidung'),
      it('fleece', 'Fleecejacke', 99.0, 19, 'Bekleidung'),
      it('shirt', 'Funktionsshirt', 49.95, 19, 'Bekleidung'),
      it('socken', 'Wandersocken 2er-Pack', 24.95, 19, 'Bekleidung'),
      it('rucksack', 'Rucksack 30 l', 129.0, 19, 'Ausrüstung'),
      it('stoecke', 'Trekkingstöcke Carbon', 119.0, 19, 'Ausrüstung'),
      it('skibrille', 'Skibrille', 139.0, 19, 'Ausrüstung'),
      it('skihelm', 'Skihelm', 169.0, 19, 'Ausrüstung'),
      it('thermos', 'Thermosflasche 0,75 l', 34.9, 19, 'Ausrüstung'),
      it('stirnlampe', 'Stirnlampe', 59.0, 19, 'Ausrüstung'),
      it('karte', 'Wanderkarte Hochschwarzwald', 9.9, 7, 'Bücher'),
      it('skiservice', 'Skiservice', 39.0, 19, 'Service', { refundable: false })
    ],
    baskets: [
      { label: 'Wanderausrüstung', lines: [{ item: 'wanderschuhe', qty: 1 }, { item: 'rucksack', qty: 1 }, { item: 'socken', qty: 2 }, { item: 'karte', qty: 1 }] },
      { label: 'Skitag', lines: [{ item: 'skihelm', qty: 1 }, { item: 'skibrille', qty: 1 }, { item: 'skiservice', qty: 1 }] }
    ]
  }
];

export const DEFAULT_DEMO_MERCHANT = DEMO_MERCHANTS[0].id;

export const demoMerchant = (id: string): DemoMerchant | undefined => DEMO_MERCHANTS.find((m) => m.id === id);

/** Kategorien in der Reihenfolge des Sortiments */
export const demoCategories = (m: DemoMerchant): string[] => [...new Set(m.items.map((i) => i.category))];

export function demoPosition(item: DemoItem, qty: number): Position {
  return { text: item.text, vat: item.vat, unitPrice: item.price, qty, unit: item.unit ?? 'Stück', refundable: item.refundable ?? true };
}

/** Nur die Händlerangaben, die der Bonkopf und die Werkbank kennen. */
export const toMerchant = ({ name, address, vatId, register }: DemoMerchant): Merchant => ({ name, address, vatId, register });
