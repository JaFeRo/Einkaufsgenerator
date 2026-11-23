import { DEFAULT_DEMO_MERCHANT, DEFAULT_OPTIONS, computeTotals, demoMerchant, demoPosition, positionGross, sanitizeReceipt, type DemoItem, type Position, type Receipt } from '../dakz';

/** Feste Einstellungen der Demo: ECC Q, keine Fehlerinjektion, Standardgrenze. */
export const DEMO_OPTIONS = { ...DEFAULT_OPTIONS, faults: {} };

/** Kleinster Bonbetrag, der als UMS_BRUTTO zulässig ist (K7 echt größer 50,00 €). */
export const MIN_GROSS_CENTS = 5001;
/** P5: größer 0 und kleiner als 100.000, höchstens drei Nachkommastellen */
export const MAX_QTY = 99999;
/** P4 in 1.3: höchstens 49.999,99 € je Position (50000,00 lehnt die Regex ab) */
export const MAX_POSITION_CENTS = 4999999;

/** Passt die Position mit dieser Menge noch in die Grenzen von P4 und P5? */
export const fitsLimits = (p: Position, qty: number): boolean => qty > 0 && qty <= MAX_QTY && Math.abs(positionGross({ ...p, qty })) <= MAX_POSITION_CENTS;

/** Monopoly-Geld in der Vorführung: ein Schein „1“ gilt als 10 € */
export const MONOPOLY_CENTS = 1000;
/** Kaufmännisch auf ganze Monopoly-Scheine runden, mindestens einer */
export const monopolyCents = (cents: number): number => Math.max(MONOPOLY_CENTS, Math.round(cents / MONOPOLY_CENTS) * MONOPOLY_CENTS);
/** Betrag in Monopoly-Scheinen, kaufmännisch gerundet */
export const monopolyNotes = (cents: number): number => Math.round(cents / MONOPOLY_CENTS);

/**
 * Preis einer Position auf volle 10 € runden: Stückware über den Stückpreis, Wiegeware und andere
 * Mengen über den Positionsbetrag (der Preis je kg ergibt sich daraus).
 */
export function monopolyPosition(p: Position): Position {
  if (p.unit === 'Stück' && Number.isInteger(p.qty)) return { ...p, unitPrice: monopolyCents(Math.round(p.unitPrice * 100)) / 100 };
  return { ...p, unitPrice: monopolyCents(positionGross(p)) / 100 / p.qty };
}

export interface CartLine {
  id: number;
  /** Artikel aus dem Sortiment; null bei freier Position */
  itemId: string | null;
  position: Position;
}

export interface DemoState {
  merchantId: string;
  lines: CartLine[];
  /** Unix-Sekunden des ersten erfassten Artikels (BON_START) */
  startedAt: number | null;
  /** Abgeschlossener Bon; solange gesetzt, ist der Warenkorb gesperrt */
  closed: Receipt | null;
  nextId: number;
  /** Preise auf volle 10 € gerundet, für Monopoly-Geld (1 Schein = 10 €) */
  monopoly: boolean;
}

export type DemoAction =
  | { type: 'merchant'; id: string }
  | { type: 'add'; item: DemoItem; qty: number; now: number }
  | { type: 'free'; position: Position; now: number }
  | { type: 'qty'; id: number; delta: number }
  | { type: 'remove'; id: number }
  | { type: 'basket'; index: number; now: number }
  | { type: 'close'; bonNr: string; now: number; tse: { signature: string; publicKey: string } }
  | { type: 'next' }
  | { type: 'monopoly'; on: boolean };

export const emptyDemo = (merchantId = DEFAULT_DEMO_MERCHANT, monopoly = false): DemoState => ({ merchantId, lines: [], startedAt: null, closed: null, nextId: 1, monopoly });

/** Umschalten nur bei leerem Warenkorb, damit ein Bon nicht gemischt gerundete Preise hat */
export const canToggleMonopoly = (s: DemoState): boolean => !s.closed && s.lines.length === 0;

const priced = (s: DemoState, p: Position): Position => (s.monopoly ? monopolyPosition(p) : p);

export const cartPositions = (s: DemoState): Position[] => s.lines.map((l) => l.position);

export const cartGross = (s: DemoState): number => computeTotals(cartPositions(s)).gross;

export const canClose = (s: DemoState): boolean => !s.closed && s.lines.length > 0 && cartGross(s) >= MIN_GROSS_CENTS;

const roundQty = (q: number) => Math.round(q * 1000) / 1000;

function addLine(s: DemoState, itemId: string | null, position: Position, now: number): DemoState {
  return { ...s, lines: [...s.lines, { id: s.nextId, itemId, position }], nextId: s.nextId + 1, startedAt: s.startedAt ?? now };
}

export function demoReducer(s: DemoState, a: DemoAction): DemoState {
  // Nach dem Abschluss ist der Bon gesperrt: nur Händlerwechsel und „Nächster Kunde“
  if (s.closed && a.type !== 'merchant' && a.type !== 'next') return s;
  switch (a.type) {
    case 'merchant':
      return demoMerchant(a.id) && a.id !== s.merchantId ? emptyDemo(a.id, s.monopoly) : s;
    case 'monopoly':
      return canToggleMonopoly(s) ? { ...s, monopoly: a.on } : s;
    case 'add': {
      const qty = roundQty(a.qty);
      // Stückware: erneutes Antippen erhöht die Menge; Wiegeware bekommt je Wiegung eine Zeile
      const same = a.item.unit ? undefined : s.lines.find((l) => l.itemId === a.item.id);
      if (same) return demoReducer(s, { type: 'qty', id: same.id, delta: qty });
      const position = priced(s, demoPosition(a.item, qty));
      if (!fitsLimits(position, qty)) return s;
      return addLine(s, a.item.id, position, a.now);
    }
    case 'free': {
      const position = priced(s, a.position);
      return fitsLimits(position, position.qty) ? addLine(s, null, position, a.now) : s;
    }
    case 'qty': {
      const line = s.lines.find((l) => l.id === a.id);
      const qty = line ? roundQty(line.position.qty + a.delta) : 0;
      if (line && qty > 0 && !fitsLimits(line.position, qty)) return s;
      const lines = s.lines.map((l) => (l === line ? { ...l, position: { ...l.position, qty } } : l)).filter((l) => l.position.qty > 0);
      return { ...s, lines, startedAt: lines.length ? s.startedAt : null };
    }
    case 'remove': {
      const lines = s.lines.filter((l) => l.id !== a.id);
      return { ...s, lines, startedAt: lines.length ? s.startedAt : null };
    }
    case 'basket': {
      const m = demoMerchant(s.merchantId);
      const basket = m?.baskets[a.index];
      if (!m || !basket) return s;
      let next: DemoState = { ...s, lines: [], startedAt: null };
      for (const line of basket.lines) {
        const item = m.items.find((i) => i.id === line.item);
        if (item) next = demoReducer(next, { type: 'add', item, qty: line.qty, now: a.now });
      }
      return next;
    }
    case 'close': {
      if (!canClose(s)) return s;
      const start = s.startedAt ?? a.now;
      return {
        ...s,
        closed: {
          bonNr: a.bonNr,
          start,
          end: Math.max(start, a.now),
          tseSignature: a.tse.signature,
          tsePublicKey: a.tse.publicKey,
          externalRef: `REF_${a.bonNr}`,
          positions: cartPositions(s)
        }
      };
    }
    case 'next':
      return emptyDemo(s.merchantId, s.monopoly);
  }
}

/** Typografische Zeichen, die es in ISO 8859-1 nicht gibt, durch einfache ersetzen (freie Position). */
export function latin1Friendly(text: string): string {
  return text
    .replace(/[‚‘’‛]/g, "'")
    .replace(/[„“”‟«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/€/g, 'EUR')
    .replace(/…/g, '...')
    .replace(/[^\u0000-ÿ]/gu, '?')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

// ---------- Persistenz ----------

function sanitizeLine(v: unknown, i: number): CartLine | null {
  if (typeof v !== 'object' || v === null) return null;
  const x = v as Record<string, any>;
  const r = sanitizeReceipt({ bonNr: '1', start: 0, end: 0, positions: [x.position] });
  return r ? { id: typeof x.id === 'number' ? x.id : i + 1, itemId: typeof x.itemId === 'string' ? x.itemId : null, position: r.positions[0] } : null;
}

export function sanitizeDemo(v: unknown, merchantFromHash?: string): DemoState {
  const x = (typeof v === 'object' && v !== null ? v : {}) as Record<string, any>;
  const stored = typeof x.merchantId === 'string' && demoMerchant(x.merchantId) ? x.merchantId : DEFAULT_DEMO_MERCHANT;
  // Ein Link auf einen anderen Händler beginnt mit leerem Warenkorb
  const monopoly = x.monopoly === true;
  if (merchantFromHash && demoMerchant(merchantFromHash) && merchantFromHash !== stored) return emptyDemo(merchantFromHash, monopoly);
  const lines = (Array.isArray(x.lines) ? x.lines : []).map(sanitizeLine).filter((l): l is CartLine => l !== null);
  const closed = x.closed ? sanitizeReceipt(x.closed) : null;
  return {
    merchantId: stored,
    lines,
    startedAt: lines.length && typeof x.startedAt === 'number' ? x.startedAt : null,
    closed,
    nextId: Math.max(typeof x.nextId === 'number' ? x.nextId : 1, ...lines.map((l) => l.id + 1)),
    monopoly
  };
}

/** Händler-ID aus „#demo/<id>“ */
export const merchantFromHash = (hash: string): string | undefined => /^#demo\/([\w-]+)$/.exec(hash)?.[1];
