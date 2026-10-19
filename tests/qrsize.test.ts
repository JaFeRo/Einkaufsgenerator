import { describe, expect, it } from 'vitest';
import { SCENARIOS, generate, prng, type Position, type Receipt } from '../src/dakz';
import { encodeQr } from '../src/qr/encode';

/** Byte-Kapazität je QR-Version 1–40 bei Fehlerkorrektur Q (ISO/IEC 18004, Byte-Modus). */
const Q_BYTES = [
  11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322, 364, 394, 442, 482, 509, 565, 611, 661, 715, 751, 805, 868, 908, 982, 1030, 1112, 1168, 1228, 1283, 1351, 1423, 1499, 1579, 1663
];
const smallestVersion = (bytes: number) => Q_BYTES.findIndex((c) => c >= bytes) + 1;

function bonWith(n: number, seed: number): Receipt {
  const rand = prng(seed);
  const base = SCENARIOS.find((s) => s.id === 'random')!.build(seed);
  const positions: Position[] = Array.from({ length: n }, (_, i) => ({
    text: `Artikel ${i} ${'x'.repeat(Math.floor(rand() * 40))}`,
    qty: 1,
    unit: 'Stück',
    unitPrice: 20 + Math.floor(rand() * 80),
    vat: rand() < 0.5 ? 7 : 19,
    refundable: true
  }));
  return { ...base, positions };
}

describe('Kleinstmögliche QR-Größe', () => {
  it('wählt für jede Nutzlast die kleinste Version', () => {
    // Je Version die Grenzwerte: genau voll (Version v) und ein Byte mehr (Version v + 1)
    for (let v = 1; v <= 40; v++) {
      expect(encodeQr('a'.repeat(Q_BYTES[v - 1]), 'Q').version, `${Q_BYTES[v - 1]} Byte`).toBe(v);
      if (v < 40) expect(encodeQr('a'.repeat(Q_BYTES[v - 1] + 1), 'Q').version, `${Q_BYTES[v - 1] + 1} Byte`).toBe(v + 1);
    }
  }, 30000);

  it('wächst mit dem Inhalt monoton, bis zwei Codes nötig sind', () => {
    let last = 0;
    let firstSplit = 0;
    for (let n = 1; n <= 60; n++) {
      const { codes } = generate(bonWith(n, 42));
      if (codes.length > 1 && !firstSplit) firstSplit = n;
      if (!firstSplit) {
        const v = encodeQr(codes[0].text, 'Q').version;
        expect(v, `${n} Positionen`).toBeGreaterThanOrEqual(last);
        expect(v).toBe(smallestVersion(codes[0].bytes));
        last = v;
      }
    }
    expect(firstSplit).toBeGreaterThan(1);
  });

  it('teilt genau dann auf, wenn der Inhalt nicht mehr in einen Code passt', () => {
    for (let n = 1; n <= 60; n++) {
      for (const seed of [1, 2, 3]) {
        const r = bonWith(n, seed);
        const { codes } = generate(r);
        const inOne = generate(r, { limitBytes: 1e9 }).codes[0].bytes;
        expect(codes.length === 1, `${n} Positionen, Seed ${seed}: einzeln ${inOne} Byte`).toBe(inOne <= 1663);
      }
    }
  });
});
