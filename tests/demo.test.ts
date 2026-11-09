import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { DEMO_MERCHANTS, allocateBonNr, computeTotals, demoCategories, demoPosition, fakeTse, generate, prng, unencodableLatin1, validateCode, decodeBytes, type Receipt } from '../src/dakz';
import { encodeQr, matrixToRgba } from '../src/qr/encode';
import { MIN_GROSS_CENTS, canClose, demoReducer, emptyDemo, latin1Friendly, merchantFromHash, sanitizeDemo, type DemoState } from '../src/ui/demoState';

const require = createRequire(import.meta.url);
const SPECS = ['1.2', '1.3'] as const;

beforeAll(async () => {
  const bin = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
  await prepareZXingModule({ overrides: { wasmBinary: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) }, fireImmediately: true });
});

const tse = fakeTse(prng(1));
const receiptOf = (positions: Receipt['positions'], bonNr = '4711'): Receipt => ({ bonNr, start: 1770201944, end: 1770201960, tseSignature: tse.signature, tsePublicKey: tse.publicKey, externalRef: `REF_${bonNr}`, positions });

function errorsOf(r: Receipt, spec: (typeof SPECS)[number]) {
  return generate(r, { spec }).codes.flatMap((c) =>
    validateCode(c.text, { spec, detectedCharset: decodeBytes(c.data).detected }).findings.filter((f) => f.severity === 'error')
  );
}

describe('Demo-Händler', () => {
  it('haben eindeutige IDs, 12–20 Artikel und Kategorien', () => {
    expect(new Set(DEMO_MERCHANTS.map((m) => m.id)).size).toBe(DEMO_MERCHANTS.length);
    for (const m of DEMO_MERCHANTS) {
      expect(m.items.length, m.id).toBeGreaterThanOrEqual(12);
      expect(m.items.length, m.id).toBeLessThanOrEqual(20);
      expect(new Set(m.items.map((i) => i.id)).size, m.id).toBe(m.items.length);
      expect(demoCategories(m).length, m.id).toBeGreaterThan(1);
      expect(m.vatId, m.id).toMatch(/^DE\d{9}$/);
    }
  });

  it('Feinkost hat Wiegeware, mindestens ein Händler einen nicht erstattungsfähigen Artikel', () => {
    expect(DEMO_MERCHANTS.find((m) => m.id === 'feinkost')!.items.filter((i) => i.unit === 'kg').length).toBeGreaterThanOrEqual(2);
    expect(DEMO_MERCHANTS.some((m) => m.items.some((i) => i.refundable === false))).toBe(true);
  });

  it('jeder Artikel ist in ISO 8859-1 kodierbar und besteht die Feldprüfung in beiden Fassungen', () => {
    for (const m of DEMO_MERCHANTS) {
      for (const item of m.items) expect(unencodableLatin1(item.text), item.text).toEqual([]);
      // Alle Artikel eines Händlers auf einem Bon, damit K7 über 50 € liegt
      const r = receiptOf(m.items.map((i) => demoPosition(i, i.unit ? 0.452 : 1)));
      for (const spec of SPECS) {
        expect(generate(r, { spec }).replaced, `${m.id} ${spec}`).toEqual([]);
        expect(errorsOf(r, spec), `${m.id} ${spec}`).toEqual([]);
      }
    }
  });

  it('jeder Beispielkorb liegt über 50,00 € und ergibt einen fehlerfreien Bon', () => {
    for (const m of DEMO_MERCHANTS) {
      expect(m.baskets.length, m.id).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < m.baskets.length; i++) {
        const s = demoReducer(emptyDemo(m.id), { type: 'basket', index: i, now: 1770201944 });
        expect(s.lines.length, `${m.id} ${i}`).toBe(m.baskets[i].lines.length);
        expect(computeTotals(s.lines.map((l) => l.position)).gross, `${m.id} ${i}`).toBeGreaterThanOrEqual(MIN_GROSS_CENTS);
        const closed = demoReducer(s, { type: 'close', bonNr: '100001', now: 1770201999, tse }).closed!;
        for (const spec of SPECS) expect(errorsOf(closed, spec), `${m.id} ${i} ${spec}`).toEqual([]);
      }
    }
  });
});

describe('Demo-Kasse', () => {
  const m = DEMO_MERCHANTS[0];
  const item = (id: string) => m.items.find((i) => i.id === id)!;

  it('Antippen erhöht die Menge, Wiegeware bekommt je Wiegung eine Zeile', () => {
    let s = emptyDemo(m.id);
    s = demoReducer(s, { type: 'add', item: item('uhr'), qty: 1, now: 100 });
    s = demoReducer(s, { type: 'add', item: item('uhr'), qty: 1, now: 200 });
    s = demoReducer(s, { type: 'add', item: item('bergkaese'), qty: 0.4521, now: 300 });
    s = demoReducer(s, { type: 'add', item: item('bergkaese'), qty: 0.3, now: 400 });
    expect(s.lines.map((l) => [l.itemId, l.position.qty])).toEqual([
      ['uhr', 2],
      ['bergkaese', 0.452],
      ['bergkaese', 0.3]
    ]);
    expect(s.startedAt).toBe(100);
  });

  it('sperrt den Abschluss bis über 50,00 € und den Warenkorb nach dem Abschluss', () => {
    let s = demoReducer(emptyDemo(m.id), { type: 'add', item: item('pralinen'), qty: 1, now: 100 });
    expect(canClose(s)).toBe(false);
    expect(demoReducer(s, { type: 'close', bonNr: '1', now: 200, tse }).closed).toBeNull();
    s = demoReducer(s, { type: 'add', item: item('uhr'), qty: 1, now: 150 });
    s = demoReducer(s, { type: 'close', bonNr: '100001', now: 200, tse });
    expect(s.closed).toMatchObject({ bonNr: '100001', start: 100, end: 200, externalRef: 'REF_100001' });
    expect(demoReducer(s, { type: 'add', item: item('uhr'), qty: 1, now: 300 })).toBe(s);
    expect(demoReducer(s, { type: 'next' }).lines).toEqual([]);
  });

  it('hält P4 und P5 ein', () => {
    let s = demoReducer(emptyDemo('uhren'), { type: 'add', item: DEMO_MERCHANTS.find((x) => x.id === 'uhren')!.items[1], qty: 30, now: 1 });
    expect(s.lines[0].position.qty).toBe(30);
    s = demoReducer(s, { type: 'qty', id: s.lines[0].id, delta: 1 });
    expect(s.lines[0].position.qty).toBe(30);
    s = demoReducer(s, { type: 'qty', id: s.lines[0].id, delta: -30 });
    expect(s.lines).toEqual([]);
    expect(s.startedAt).toBeNull();
  });

  it('BON_NR bleibt über mehrere Kunden fortlaufend und eindeutig', () => {
    let counter = { next: 100001, issued: [] as string[] };
    let s: DemoState = emptyDemo(m.id);
    const nrs: string[] = [];
    for (let k = 0; k < 5; k++) {
      s = demoReducer(s, { type: 'basket', index: 0, now: 1000 + k });
      const { bonNr, state } = allocateBonNr(counter);
      counter = state;
      s = demoReducer(s, { type: 'close', bonNr, now: 2000 + k, tse });
      nrs.push(s.closed!.bonNr);
      s = demoReducer(s, { type: 'next' });
    }
    expect(nrs).toEqual(['100001', '100002', '100003', '100004', '100005']);
  });

  it('ein großer Korb teilt sich auf mehrere Codes auf, der QR-Rundlauf stimmt', async () => {
    let s = emptyDemo('feinkost');
    const items = DEMO_MERCHANTS.find((x) => x.id === 'feinkost')!.items;
    // Je Position eine eigene Zeile (wie viele einzelne Wiegungen bzw. freie Positionen)
    for (let k = 0; k < 120; k++) {
      const it = items[k % items.length];
      s = demoReducer(s, { type: 'free', position: demoPosition(it, it.unit ? 0.1 + k / 1000 : 1), now: 1770201944 });
    }
    expect(s.lines.length).toBe(120);
    s = demoReducer(s, { type: 'close', bonNr: '100009', now: 1770202100, tse });
    for (const spec of SPECS) {
      const { codes } = generate(s.closed!, { spec });
      expect(codes.length, spec).toBeGreaterThan(1);
      expect(errorsOf(s.closed!, spec), spec).toEqual([]);
      for (const c of codes) {
        const [r] = await readBarcodes(matrixToRgba(encodeQr(c.text, 'Q', c.charset), 3) as unknown as ImageData, { formats: ['QRCode'], tryHarder: false });
        expect(Array.from(r!.bytes), `${spec} QR ${c.index}`).toEqual(Array.from(c.data));
      }
    }
  });

  it('freie Position: typografische Zeichen werden ISO-8859-1-tauglich', () => {
    expect(latin1Friendly('„Kerze“ – 10 € …')).toBe('"Kerze" - 10 EUR ...');
    expect(unencodableLatin1(latin1Friendly('Emoji 😀 und Łódź'))).toEqual([]);
  });

  it('Zustand aus dem Speicher und Deep-Link', () => {
    expect(merchantFromHash('#demo/mode')).toBe('mode');
    expect(merchantFromHash('#demo')).toBeUndefined();
    const s = demoReducer(emptyDemo('mode'), { type: 'basket', index: 0, now: 7 });
    const restored = sanitizeDemo(JSON.parse(JSON.stringify(s)));
    expect(restored.lines).toEqual(s.lines);
    expect(restored.startedAt).toBe(7);
    expect(sanitizeDemo(s, 'elektro')).toEqual(emptyDemo('elektro'));
    expect(sanitizeDemo({ merchantId: 'gibtsnicht', lines: 'kaputt' })).toEqual(emptyDemo());
  });
});
