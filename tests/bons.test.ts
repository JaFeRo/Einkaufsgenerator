import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, MERCHANT, MAX_BON_NR, allocateBonNr, deriveExternalRef, instantiate, isValidBonNr, markIssued, parseSavedBons, sanitizeReceipt, type SavedBon } from '../src/dakz';

describe('BON_NR-Zähler', () => {
  it('zählt fortlaufend hoch', () => {
    let s = { next: 100000, issued: [] as string[] };
    const got: string[] = [];
    for (let i = 0; i < 3; i++) {
      const r = allocateBonNr(s);
      got.push(r.bonNr);
      s = r.state;
    }
    expect(got).toEqual(['100000', '100001', '100002']);
    expect(s.next).toBe(100003);
  });

  it('überspringt bereits verwendete Nummern', () => {
    const s = markIssued(markIssued({ next: 5, issued: [] }, '5'), '6');
    expect(allocateBonNr(s).bonNr).toBe('7');
  });

  it('vergibt nie eine Nummer doppelt', () => {
    let s = { next: 1, issued: ['3', '4', '10'] };
    const seen = new Set(s.issued);
    for (let i = 0; i < 50; i++) {
      const r = allocateBonNr(s);
      expect(seen.has(r.bonNr)).toBe(false);
      seen.add(r.bonNr);
      s = r.state;
    }
  });

  it('erzeugt nur gültige Nummern und bricht an der Obergrenze ab', () => {
    expect(isValidBonNr(allocateBonNr({ next: 0, issued: [] }).bonNr)).toBe(true);
    expect(allocateBonNr({ next: MAX_BON_NR, issued: [] }).bonNr).toBe('1000000000000');
    expect(() => allocateBonNr({ next: MAX_BON_NR + 1, issued: [] })).toThrow(RangeError);
  });
});

describe('Gespeicherte Bons', () => {
  const tpl: SavedBon = {
    id: 'a',
    name: 'Testfall',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    positions: [{ text: 'Uhr', qty: 1, unit: 'Stück', unitPrice: 289, vat: 19, refundable: true }],
    merchant: MERCHANT,
    options: DEFAULT_OPTIONS,
    eccOverride: null,
    durationSec: 30,
    externalRef: ''
  };

  it('setzt beim Laden Nummer, Zeit und Referenz neu', () => {
    const r = instantiate(tpl, '4711', Date.UTC(2026, 9, 3, 12) , { signature: 's', publicKey: 'k' });
    expect(r).toMatchObject({ bonNr: '4711', start: 1791028800, end: 1791028830, externalRef: 'REF_4711', tseSignature: 's' });
    r.positions[0].text = 'geändert';
    expect(tpl.positions[0].text).toBe('Uhr');
  });

  it('behält eigene Referenzen', () => {
    expect(deriveExternalRef('REF_123', '9')).toBe('REF_9');
    expect(deriveExternalRef('KUNDE-A', '9')).toBe('KUNDE-A');
  });

  it('liest exportierte Dateien und verwirft Ungültiges', () => {
    const file = { kind: 'dakz-bonsimulator/bons', bons: [tpl, { name: 'kaputt' }, { name: 'x', positions: [{ text: 'A', qty: 'viel' }, 5] }] };
    const parsed = parseSavedBons(JSON.parse(JSON.stringify(file)), { merchant: MERCHANT, options: DEFAULT_OPTIONS });
    expect(parsed.map((b) => b.name)).toEqual(['Testfall', 'x']);
    expect(parsed[1].positions).toEqual([{ text: 'A', qty: 1, unit: 'Stück', unitPrice: 0, vat: 19, refundable: true }]);
    expect(parsed[0].options.limitBytes).toBe(1663);
  });
});

describe('sanitizeReceipt', () => {
  const good = { bonNr: '5', start: 1700000000, end: 1700000009, tseSignature: 'a', tsePublicKey: 'b', externalRef: '', positions: [{ text: 'x', qty: 1, unit: 'Stück', unitPrice: 60, vat: 19, refundable: true }] };
  it('akzeptiert einen gültigen Bon', () => expect(sanitizeReceipt(good)).toEqual(good));
  it('füllt fehlende Positionsfelder mit Standardwerten', () => {
    expect(sanitizeReceipt({ ...good, positions: [{ text: 'x' }] })?.positions[0]).toEqual({ text: 'x', qty: 1, unit: 'Stück', unitPrice: 0, vat: 19, refundable: true });
  });
  it('verwirft unbrauchbare Bons', () => {
    for (const bad of [null, 'x', {}, { ...good, positions: [] }, { ...good, positions: [5] }, { ...good, start: 'gestern' }, { ...good, bonNr: 5 }]) expect(sanitizeReceipt(bad)).toBeNull();
  });
});
