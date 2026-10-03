import { csvField, formatQty, formatRate, money, utf8Length } from './format';
import type { GenerateOptions, GenerateResult, Position, Receipt, Totals } from './types';

/** Version 40, ECC Q, Byte-Modus: 1.663 Byte (siehe docs/PLAN.md, Abschnitt 2). */
export const QR_CAPACITY_Q_BYTES = 1663;

export const DEFAULT_OPTIONS: GenerateOptions = {
  rateStyle: 'plain',
  trailingLF: true,
  limitBytes: QR_CAPACITY_Q_BYTES,
  alwaysWriteTotal: false,
  faults: {}
};

/** Positionsbrutto in Cent: Menge × Einzelpreis, kaufmännisch gerundet. */
export function positionGross(p: Position): number {
  // toFixed fängt Gleitkomma-Artefakte wie 1,005 × 100 = 100,49999… ab
  return Math.round(Number((p.qty * p.unitPrice * 100).toFixed(6)));
}

export function computeTotals(positions: Position[]): Totals {
  const byRate = new Map<number, number>();
  for (const p of positions) byRate.set(p.vat, (byRate.get(p.vat) ?? 0) + positionGross(p));
  const vatLines = [...byRate.keys()]
    .sort((a, b) => a - b)
    .map((rate) => {
      const gross = byRate.get(rate)!;
      const net = Math.round(gross / (1 + rate / 100));
      return { rate, gross, net, vat: gross - net };
    });
  const sum = (k: 'gross' | 'net' | 'vat') => vatLines.reduce((a, l) => a + l[k], 0);
  return { vatLines, gross: sum('gross'), net: sum('net'), vat: sum('vat') };
}

type Row = (string | number)[];

interface Lines {
  head: { bonNr: string; start: number; end: number; total: string };
  e: Row | null;
  m: Row[];
  p: Row[];
  totals: Totals;
}

function buildLines(receipt: Receipt, opt: GenerateOptions): Lines {
  const totals = computeTotals(receipt.positions);
  const f = opt.faults;
  const rate = (r: number) => {
    const s = formatRate(r, opt.rateStyle);
    return f.rateWithSpace ? s.replace(/^(\d+)/, '$1 ') : s;
  };

  const head = {
    bonNr: receipt.bonNr,
    start: receipt.start,
    end: f.endBeforeStart ? receipt.start - 60 : receipt.end,
    total: money(totals.gross + (f.totalMismatch ? 100 : 0))
  };

  let e: Row | null = ['E', money(totals.net), money(totals.vat), receipt.tseSignature, receipt.tsePublicKey];
  if (receipt.externalRef) e.push(receipt.externalRef);
  if (f.dropE) e = null;

  const m = totals.vatLines.map((l) => ['M', rate(l.rate), money(l.gross), money(l.net), money(l.vat)]);
  const p = f.noPositions
    ? []
    : receipt.positions.map((pos) => [
        'P',
        rate(pos.vat),
        pos.refundable ? '1' : '0',
        money(positionGross(pos)),
        formatQty(pos.qty),
        pos.unit || 'Stück',
        pos.text
      ]);

  return { head, e, m, p, totals };
}

function kRow(head: Lines['head'], nr: number, count: number, writeCount: boolean): Row {
  return ['K', nr, writeCount ? count : '', head.bonNr, head.start, head.end, head.total];
}

/**
 * Erzeugt den Inhalt der QR-Codes. Passt er nicht in einen Code, wird nach Kapitel 5
 * aufgeteilt: Zeilen werden nie getrennt, Folgecodes enthalten nur K- und P-Zeilen.
 */
export function generate(receipt: Receipt, options: Partial<GenerateOptions> = {}): GenerateResult {
  const opt: GenerateOptions = { ...DEFAULT_OPTIONS, ...options, faults: { ...options.faults } };
  const lb = opt.faults.crlf ? '\r\n' : '\n';
  const b = buildLines(receipt, opt);
  const serializeRow = (r: Row) => r.map(csvField).join(';');
  const rowLen = (r: Row) => utf8Length(serializeRow(r)) + utf8Length(lb);

  // Die Gesamtanzahl ändert die Länge der K-Zeile – bis zur Stabilität wiederholen.
  let count = 1;
  let chunks: Row[][] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const writeCount = count > 1 || opt.alwaysWriteTotal;
    const kLen = rowLen(kRow(b.head, count, count, writeCount));
    chunks = [];
    let rows: Row[] = [];
    let size = kLen;
    for (const r of [...(b.e ? [b.e] : []), ...b.m]) {
      rows.push(r);
      size += rowLen(r);
    }
    for (const r of b.p) {
      const len = rowLen(r);
      if (size + len > opt.limitBytes && rows.some((x) => x[0] === 'P')) {
        chunks.push(rows);
        rows = [];
        size = kLen;
      }
      rows.push(r);
      size += len;
    }
    chunks.push(rows);
    if (chunks.length === count) break;
    count = chunks.length;
  }

  const writeTotal = chunks.length > 1 || opt.alwaysWriteTotal;
  const codes = chunks.map((rows, i) => {
    const all = [kRow(b.head, i + 1, chunks.length, writeTotal), ...rows];
    let text = all.map(serializeRow).join(lb);
    if (opt.trailingLF) text += lb;
    return { index: i + 1, count: chunks.length, text, bytes: utf8Length(text), chars: text.length };
  });

  return { codes, totals: b.totals };
}
