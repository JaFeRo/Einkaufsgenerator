import { computeTotals } from './generate';
import type { Merchant, Position, Receipt } from './types';

/** Kleiner deterministischer Zufallsgenerator (mulberry32), damit Bons per Seed reproduzierbar sind. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => Math.floor(Math.random() * 2 ** 31);

interface CatalogItem {
  text: string;
  vat: number;
  price: number;
  unit?: string;
}

/** Sortiment eines grenznahen Kaufhauses – typische Tax-free-Einkäufe. */
export const CATALOG: CatalogItem[] = [
  { text: 'Uhr Chronograph Edelstahl', vat: 19, price: 289.0 },
  { text: 'Kaschmir-Pullover', vat: 19, price: 149.95 },
  { text: 'Kopfhörer Noise Cancelling', vat: 19, price: 249.0 },
  { text: 'Eau de Toilette 100 ml', vat: 19, price: 89.9 },
  { text: 'Laufschuhe Trail', vat: 19, price: 129.99 },
  { text: 'Lederhandtasche', vat: 19, price: 219.0 },
  { text: 'Espressomaschine', vat: 19, price: 399.0 },
  { text: 'Messerset 5-tlg.', vat: 19, price: 119.0 },
  { text: 'Sonnenbrille', vat: 19, price: 159.0 },
  { text: 'Gesichtscreme 50 ml', vat: 19, price: 34.95 },
  { text: 'Smartphone-Hülle Leder', vat: 19, price: 39.99 },
  { text: 'Riesling Spätlese 0,75 l', vat: 19, price: 11.9 },
  { text: 'Multivitamin 60 Stk.', vat: 19, price: 12.95 },
  { text: 'Schwarzwälder Schinken', vat: 7, price: 32.5, unit: 'kg' },
  { text: 'Bergkäse am Stück', vat: 7, price: 24.9, unit: 'kg' },
  { text: 'Kaffee Bohnen 1 kg', vat: 7, price: 16.99 },
  { text: 'Pralinen-Box', vat: 7, price: 9.95 },
  { text: 'Kinderbuch', vat: 7, price: 14.0 },
  { text: 'Bildband Bodensee', vat: 7, price: 39.9 }
];

export const MERCHANT: Merchant = {
  name: 'Kaufhaus Rheinbrücke',
  address: 'Marktstätte 4 · 78462 Konstanz',
  vatId: 'DE000000000',
  register: 'Kasse 1 · Filiale 01'
};

function base64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

/** Zufällige, aber realistisch aussehende TSE-Angaben (Signatur 64 Byte, öffentlicher Schlüssel 0x04‖X‖Y). */
export function fakeTse(rand: () => number): { signature: string; publicKey: string } {
  const sig = new Uint8Array(64).map(() => Math.floor(rand() * 256));
  const key = new Uint8Array(65).map(() => Math.floor(rand() * 256));
  key[0] = 0x04;
  return { signature: base64(sig), publicKey: base64(key) };
}

let keyPair: Promise<CryptoKeyPair> | null = null;

/**
 * Echte ECDSA-Signatur (P-384, SHA-384) über die Belegdaten mit einem pro Sitzung erzeugten Schlüssel.
 * Kein BSI-zertifiziertes TSE-Format, aber kryptografisch gültig und nachprüfbar.
 */
export async function signTse(receipt: Receipt): Promise<{ signature: string; publicKey: string }> {
  keyPair ??= crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-384' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
  const kp = await keyPair;
  const t = computeTotals(receipt.positions);
  const processData = ['Beleg', receipt.bonNr, receipt.start, receipt.end, t.vatLines.map((l) => `${l.rate}:${l.gross}`).join('_')].join('^');
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-384' }, kp.privateKey, new TextEncoder().encode(processData));
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  return { signature: base64(new Uint8Array(sig)), publicKey: base64(new Uint8Array(raw)) };
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function catalogPosition(rand: () => number, item: CatalogItem = pick(rand, CATALOG)): Position {
  const kg = item.unit === 'kg';
  return {
    text: item.text,
    vat: item.vat,
    unitPrice: item.price,
    unit: item.unit ?? 'Stück',
    qty: kg ? Math.round((0.1 + rand() * 0.8) * 1000) / 1000 : 1 + Math.floor(rand() * 2),
    refundable: true
  };
}

function base(rand: () => number, positions: Position[], now = Date.now()): Receipt {
  const start = Math.floor(now / 1000) - Math.floor(rand() * 3600);
  const bonNr = String(1000 + Math.floor(rand() * 899000));
  const tse = fakeTse(rand);
  return {
    bonNr,
    start,
    end: start + 5 + Math.floor(rand() * 90),
    tseSignature: tse.signature,
    tsePublicKey: tse.publicKey,
    externalRef: `REF_${bonNr}`,
    positions
  };
}

const p = (text: string, vat: number, unitPrice: number, qty = 1, unit = 'Stück', refundable = true): Position => ({
  text,
  vat,
  unitPrice,
  qty,
  unit,
  refundable
});

export interface Scenario {
  id: string;
  label: string;
  description: string;
  build: (seed: number) => Receipt;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'random',
    label: 'Zufallseinkauf',
    description: '2–5 Artikel aus dem Sortiment, über 50 €',
    build: (seed) => {
      const rand = prng(seed);
      let positions: Position[] = [];
      do {
        const n = 2 + Math.floor(rand() * 4);
        positions = Array.from({ length: n }, () => catalogPosition(rand));
      } while (computeTotals(positions).gross <= 5000);
      return base(rand, positions);
    }
  },
  {
    id: 'zoll61',
    label: 'Zoll-Beispiel 6.1',
    description: 'Datensatz aus der Spezifikation, Abschnitt 6.1',
    build: () => ({
      bonNr: '302592',
      start: 1770201944,
      end: 1770201945,
      tseSignature: 'MEQCID5hG9Z8xPk1qN4v8WzR3mK9sT5Y6b7c8d9e0f1a2b3cAiQ4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
      tsePublicKey: 'BKizwdLj9KW2x9jp8KGyw9Tl9qe4ydDh8qO0xdbl56f4qbDB0uP0pbbH2OnwobLD1OX2p7jJ0OHyo7TF1g==',
      externalRef: 'REF_302592',
      positions: [p('Cla Multi Int Nuit PTS', 19, 105.2)]
    })
  },
  {
    id: 'fiveRates',
    label: '5 Steuersätze',
    description: 'Höchstzahl an M-Zeilen wie Beispiel 6.2',
    build: (seed) =>
      base(prng(seed), [
        p('Nasenspray', 7, 3.5),
        p('Volvic Tea Zero', 8, 5.94),
        p('Vollkorntoast', 13, 1.99),
        p('Sonstige Filme', 19, 16.99, 2),
        p('Presse Erzeugnisse', 21, 9.8)
      ])
  },
  {
    id: 'kg',
    label: 'Wiegeware',
    description: 'Mengen mit Nachkommastellen, eigene Einheiten',
    build: (seed) =>
      base(prng(seed), [
        p('Bergkäse am Stück', 7, 24.9, 0.648, 'kg'),
        p('Schwarzwälder Schinken', 7, 32.5, 0.412, 'kg'),
        p('Kirschwasser 0,7 l', 19, 29.9, 1, 'Flasche'),
        p('Pralinen "Edition Bodensee"', 7, 14.95, 2)
      ])
  },
  {
    id: 'mixed',
    label: 'Rabatt & Pfand',
    description: 'Negative Position und nicht erstattungsfähige Ware',
    build: (seed) =>
      base(prng(seed), [
        p('Winterjacke Daunen', 19, 279.0),
        p('Aktionsrabatt 20 %', 19, -55.8),
        p('Mineralwasser 6 × 1 l', 19, 4.14),
        p('Pfand Kasten', 19, 3.3, 1, 'Stück', false),
        p('Geschenkgutschein-Verpackung', 19, 2.5, 1, 'Stück', false)
      ])
  },
  {
    id: 'edge',
    label: 'Grenze 50,01 €',
    description: 'Kleinster gültiger UMS_BRUTTO',
    build: (seed) => base(prng(seed), [p('Gesichtscreme 50 ml', 19, 34.95), p('Handcreme', 19, 15.06)])
  },
  {
    id: 'special',
    label: 'Sonderzeichen',
    description: 'Semikolon, Anführungszeichen und Umlaute im Artikeltext',
    build: (seed) =>
      base(prng(seed), [
        p('Weinglas "Bodensee"; 6er-Set', 19, 59.9),
        p('Größe XL – Übergangsjacke', 19, 119.0),
        p('Crème brûlée Förmchen', 19, 18.5, 2)
      ])
  },
  {
    id: 'overflow',
    label: 'Überlauf',
    description: 'So viele Positionen, dass mehrere QR-Codes nötig sind',
    build: (seed) => {
      const rand = prng(seed);
      const positions = Array.from({ length: 34 }, (_, i) => {
        const pos = catalogPosition(rand);
        pos.text += ` – Art.-Nr. ${400100 + i * 7}, Farbe Anthrazit, Größe M`;
        return pos;
      });
      return base(rand, positions);
    }
  }
];

export function randomPosition(seed: number): Position {
  return catalogPosition(prng(seed));
}
