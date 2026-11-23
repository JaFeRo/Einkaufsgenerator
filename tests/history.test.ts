import { describe, expect, it, vi } from 'vitest';
import { DEMO_MERCHANTS, computeTotals, decodeBytes, fakeTse, generate, positionGross, prng, validateCode, type Receipt } from '../src/dakz';
import { entryId, entryRefundCents, historyApi, isPartial, mergeHistory, parseHistory, refundCents, refundNotes, type HistoryEntry } from '../src/ui/demoHistory';
import { MIN_GROSS_CENTS, canClose, canToggleMonopoly, demoReducer, emptyDemo, monopolyCents, monopolyNotes, monopolyPosition, sanitizeDemo, type DemoState } from '../src/ui/demoState';

const tse = fakeTse(prng(3));
const now = 1795000000;
const close = (s: DemoState, bonNr = '200001') => demoReducer(s, { type: 'close', bonNr, now: now + 30, tse });
const item = (merchant: string, id: string) => DEMO_MERCHANTS.find((m) => m.id === merchant)!.items.find((i) => i.id === id)!;

describe('Monopoly-Preise', () => {
  it('runden kaufmännisch auf 10 €, mindestens 10 €', () => {
    expect(monopolyCents(24900)).toBe(25000);
    expect(monopolyCents(8990)).toBe(9000);
    expect(monopolyCents(3495)).toBe(3000);
    expect(monopolyCents(240)).toBe(1000);
    expect(monopolyCents(1500)).toBe(2000);
    expect(monopolyNotes(32000)).toBe(32);
  });

  it('Stückware über den Stückpreis, Wiegeware über den Positionsbetrag', () => {
    expect(monopolyPosition({ text: 'X', vat: 19, unitPrice: 34.95, qty: 3, unit: 'Stück', refundable: true }).unitPrice).toBe(30);
    const kg = monopolyPosition({ text: 'Käse', vat: 7, unitPrice: 66.4, qty: 0.452, unit: 'kg', refundable: true });
    expect(kg.qty).toBe(0.452);
    expect(positionGross(kg)).toBe(3000);
  });

  it('Kasse im Monopoly-Modus: jeder Betrag ein Vielfaches von 10 €, Bon bleibt konform', () => {
    for (const m of DEMO_MERCHANTS) {
      let s: DemoState = { ...emptyDemo(m.id), monopoly: true };
      for (const i of m.items) s = demoReducer(s, { type: 'add', item: i, qty: i.unit ? 0.537 : 1, now });
      s = demoReducer(s, { type: 'free', position: { text: 'Frei', vat: 19, unitPrice: 12.34, qty: 1, unit: 'Stück', refundable: true }, now });
      for (const l of s.lines) expect(positionGross(l.position) % 1000, `${m.id} ${l.position.text}`).toBe(0);
      const closed = close(s).closed!;
      expect(computeTotals(closed.positions).gross % 1000).toBe(0);
      for (const spec of ['1.2', '1.3'] as const)
        for (const c of generate(closed, { spec }).codes) {
          const errors = validateCode(c.text, { spec, detectedCharset: decodeBytes(c.data).detected }).findings.filter((f) => f.severity === 'error');
          expect(errors, `${m.id} ${spec}`).toEqual([]);
        }
    }
  });

  it('Beispieleinkäufe werden gerundet, ein 5er reicht nicht für den Mindestumsatz', () => {
    const s = demoReducer({ ...emptyDemo('kaufhaus'), monopoly: true }, { type: 'basket', index: 0, now });
    expect(s.lines.every((l) => positionGross(l.position) % 1000 === 0)).toBe(true);
    // 50 € genau ist zu wenig, 60 € reicht
    const fifty = demoReducer({ ...emptyDemo('kaufhaus'), monopoly: true }, { type: 'free', position: { text: 'A', vat: 19, unitPrice: 50, qty: 1, unit: 'Stück', refundable: true }, now });
    expect(canClose(fifty)).toBe(false);
    const sixty = demoReducer(fifty, { type: 'free', position: { text: 'B', vat: 19, unitPrice: 10, qty: 1, unit: 'Stück', refundable: true }, now });
    expect(computeTotals(sixty.lines.map((l) => l.position)).gross).toBeGreaterThanOrEqual(MIN_GROSS_CENTS);
    expect(canClose(sixty)).toBe(true);
  });

  it('umschalten nur bei leerem Warenkorb; bleibt bei Händlerwechsel, nächstem Kunden und Neuladen', () => {
    let s = demoReducer(emptyDemo('kaufhaus'), { type: 'monopoly', on: true });
    expect(s.monopoly).toBe(true);
    s = demoReducer(s, { type: 'add', item: item('kaufhaus', 'uhr'), qty: 1, now });
    expect(canToggleMonopoly(s)).toBe(false);
    expect(demoReducer(s, { type: 'monopoly', on: false }).monopoly).toBe(true);
    expect(demoReducer(s, { type: 'merchant', id: 'feinkost' }).monopoly).toBe(true);
    expect(demoReducer(close(s), { type: 'next' }).monopoly).toBe(true);
    expect(sanitizeDemo(JSON.parse(JSON.stringify(s))).monopoly).toBe(true);
    expect(sanitizeDemo({}).monopoly).toBe(false);
  });
});

const receipt = (positions: Receipt['positions'], bonNr = '300001', start = now): Receipt => ({ bonNr, start, end: start + 20, tseSignature: tse.signature, tsePublicKey: tse.publicKey, externalRef: `REF_${bonNr}`, positions });
const entry = (r: Receipt, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: entryId(r),
  merchantId: 'kaufhaus',
  merchantName: 'Kaufhaus Rheinbrücke',
  spec: '1.3',
  monopoly: false,
  createdAt: r.end * 1000,
  receipt: r,
  voidedAt: null,
  exported: null,
  note: '',
  ...extra
});

describe('Erstattung', () => {
  it('MwSt. nur der erstattungsfähigen Positionen, Auszahlung kaufmännisch in Scheinen, mindestens einer', () => {
    const r = receipt([
      { text: 'Kopfhörer', vat: 19, unitPrice: 250, qty: 1, unit: 'Stück', refundable: true },
      { text: 'Geschenkverpackung', vat: 19, unitPrice: 10, qty: 1, unit: 'Stück', refundable: false }
    ]);
    expect(refundCents(r)).toBe(3992);
    expect(refundNotes(3992)).toBe(4);
    expect(refundNotes(958)).toBe(1); // 60 € Einkauf
    expect(refundNotes(1597)).toBe(2); // 100 €
    expect(refundNotes(327)).toBe(1); // 50,01 € zu 7 %: trotzdem ein Schein
    expect(refundNotes(0)).toBe(0);
    expect(refundCents(receipt([{ text: 'Service', vat: 19, unitPrice: 80, qty: 1, unit: 'Stück', refundable: false }]))).toBe(0);
  });

  it('Teilausfuhr: nur die ausgeführten Positionen zählen', () => {
    const r = receipt([
      { text: 'Uhr', vat: 19, unitPrice: 290, qty: 1, unit: 'Stück', refundable: true },
      { text: 'Käse', vat: 7, unitPrice: 30, qty: 1, unit: 'Stück', refundable: true },
      { text: 'Verpackung', vat: 19, unitPrice: 10, qty: 1, unit: 'Stück', refundable: false }
    ]);
    expect(refundCents(r, [0])).toBe(4630);
    expect(refundCents(r, [1])).toBe(196);
    expect(refundNotes(refundCents(r, [1]))).toBe(1);
    expect(refundCents(r, [])).toBe(0);
    expect(refundCents(r, [2])).toBe(0); // nicht erstattungsfähig bleibt außen vor
    expect(refundCents(r, null)).toBe(refundCents(r, [0, 1]));
    // Vor der Entwertung zählt der ganze Bon, danach die Auswahl
    expect(entryRefundCents(entry(r, { exported: [1] }))).toBe(refundCents(r));
    const part = entry(r, { voidedAt: 9, exported: [1] });
    expect(entryRefundCents(part)).toBe(196);
    expect(isPartial(part)).toBe(true);
    expect(isPartial(entry(r, { voidedAt: 9, exported: [0, 1] }))).toBe(false);
    expect(isPartial(entry(r, { voidedAt: 9, exported: null }))).toBe(false);
  });

  it('gemischte Steuersätze wie auf dem Bon je Satz gerechnet', () => {
    const r = receipt([
      { text: 'A', vat: 19, unitPrice: 100, qty: 1, unit: 'Stück', refundable: true },
      { text: 'B', vat: 7, unitPrice: 50, qty: 1, unit: 'Stück', refundable: true }
    ]);
    expect(refundCents(r)).toBe(computeTotals(r.positions).vat);
  });
});

describe('Verlauf', () => {
  const a = receipt([{ text: 'A', vat: 19, unitPrice: 60, qty: 1, unit: 'Stück', refundable: true }], '1');
  const b = receipt([{ text: 'B', vat: 7, unitPrice: 70, qty: 1, unit: 'Stück', refundable: true }], '2', now + 100);

  it('Auswahl der ausgeführten Positionen wird beim Lesen bereinigt', () => {
    const [e] = parseHistory([{ ...entry(a), voidedAt: 3, exported: [0, 0, 7, -1, 'x'] }]);
    expect(e.exported).toEqual([0]);
    expect(parseHistory([{ ...entry(a), voidedAt: null, exported: [0] }])[0].exported).toBeNull();
  });

  it('liest gespeicherte und exportierte Listen, verwirft Ungültiges und Doppeltes', () => {
    const list = parseHistory({ entries: [entry(b), entry(a), { foo: 1 }, entry(a), null] });
    expect(list.map((e) => e.receipt.bonNr)).toEqual(['1', '2']);
    expect(parseHistory([entry(a)])).toHaveLength(1);
    expect(parseHistory('kaputt')).toEqual([]);
  });

  it('gleiche BON_NR nach Zähler-Reset mit anderer Startzeit bleibt ein eigener Eintrag', () => {
    const again = receipt(a.positions, '1', now + 999);
    expect(parseHistory([entry(a), entry(again)])).toHaveLength(2);
  });

  it('Import ergänzt neue Bons und übernimmt Entwertungen, ohne bekannte zu überschreiben', () => {
    const cur = [entry(a, { note: 'hier' })];
    const r = mergeHistory(cur, [entry(a, { voidedAt: 5, note: 'dort' }), entry(b)]);
    expect([r.added, r.updated]).toEqual([1, 1]);
    expect(r.entries[0]).toMatchObject({ voidedAt: 5, note: 'hier' });
    const p = mergeHistory([entry(a)], [entry(a, { voidedAt: 7, exported: [] })]);
    expect(p.entries[0]).toMatchObject({ voidedAt: 7, exported: [] });
    expect(mergeHistory(r.entries, [entry(a)]).entries[0].voidedAt).toBe(5);
  });

  it('erfassen, entwerten, zurücknehmen, Notiz, löschen, exportieren', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
    historyApi.clear();
    expect(historyApi.record({ merchantId: 'kaufhaus', merchantName: 'K', spec: '1.3', monopoly: true, createdAt: 1, receipt: a })).toBe(true);
    historyApi.record({ merchantId: 'kaufhaus', merchantName: 'K', spec: '1.3', monopoly: true, createdAt: 2, receipt: a });
    const read = () => (JSON.parse(historyApi.exportJson()) as { entries: HistoryEntry[] }).entries;
    expect(read()).toHaveLength(1);
    historyApi.void(entryId(a), [0], 1234);
    expect(read()[0]).toMatchObject({ voidedAt: 1234, exported: [0] });
    historyApi.setNote(entryId(a), 'Pass geprüft');
    historyApi.unvoid(entryId(a));
    expect(read()[0]).toMatchObject({ voidedAt: null, exported: null, note: 'Pass geprüft' });
    historyApi.void(entryId(a), null, 99);
    expect(read()[0]).toMatchObject({ voidedAt: 99, exported: null });
    expect(parseHistory(JSON.parse(historyApi.exportJson()))).toHaveLength(1);
    historyApi.remove(entryId(a));
    expect(read()).toEqual([]);
    vi.unstubAllGlobals();
  });
});
