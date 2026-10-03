import { describe, expect, it } from 'vitest';
import examples from './fixtures/zoll-beispiele.json';
import { DEFAULT_OPTIONS, SCENARIOS, computeTotals, generate, money, positionGross, utf8Length, validateCode, validateSet } from '../src/dakz';

const scenario = (id: string, seed = 1) => SCENARIOS.find((s) => s.id === id)!.build(seed);

describe('generate', () => {
  it('reproduziert Zoll-Beispiel 6.1 byte-genau', () => {
    const { codes } = generate(scenario('zoll61'), { trailingLF: false });
    expect(codes).toHaveLength(1);
    expect(codes[0].text).toBe(examples.ex61);
  });

  it('schreibt LF nach jedem record, wenn gewünscht', () => {
    const { codes } = generate(scenario('zoll61'));
    expect(codes[0].text.endsWith('\n')).toBe(true);
    expect(codes[0].text.split('\n')).toHaveLength(5);
  });

  it('berechnet Steuern je Satz wie Beispiel 6.1', () => {
    const t = computeTotals(scenario('zoll61').positions);
    expect(t.vatLines).toEqual([{ rate: 19, gross: 10520, net: 8840, vat: 1680 }]);
  });

  it('formatiert Steuersätze wahlweise mit Nachkommastellen', () => {
    const { codes } = generate(scenario('zoll61'), { rateStyle: 'fixed' });
    expect(codes[0].text).toContain('\nM;19,00;105,20;88,40;16,80\n');
    expect(codes[0].text).toContain('\nP;19,00;1;105,20;1;Stück;');
  });

  it('maskiert Semikolon und Anführungszeichen (C5, C7)', () => {
    const { codes } = generate(scenario('special'));
    expect(codes[0].text).toContain('"Weinglas ""Bodensee""; 6er-Set"');
    const check = validateCode(codes[0].text);
    expect(check.records.find((r) => r[0] === 'P')![6]).toBe('Weinglas "Bodensee"; 6er-Set');
  });

  it('rundet Wiegeware kaufmännisch', () => {
    expect(positionGross({ text: 'x', qty: 0.648, unitPrice: 24.9, unit: 'kg', vat: 7, refundable: true })).toBe(1614);
    expect(positionGross({ text: 'x', qty: 1, unitPrice: 1.005, unit: 'Stück', vat: 7, refundable: true })).toBe(101);
  });

  it('teilt bei Überlauf auf, ohne Zeilen zu trennen (Kapitel 5)', () => {
    const r = scenario('overflow', 7);
    const { codes } = generate(r);
    expect(codes.length).toBeGreaterThan(1);
    codes.forEach((c, i) => {
      expect(c.bytes).toBeLessThanOrEqual(DEFAULT_OPTIONS.limitBytes);
      const lines = c.text.trimEnd().split('\n');
      expect(lines[0]).toMatch(new RegExp(`^K;${i + 1};${codes.length};${r.bonNr};`));
      if (i > 0) expect(lines.slice(1).every((l) => l.startsWith('P;'))).toBe(true);
    });
    const pLines = codes.flatMap((c) => c.text.split('\n').filter((l) => l.startsWith('P;')));
    expect(pLines).toHaveLength(r.positions.length);
    expect(validateSet(codes.map((c) => c.text))).toMatchObject({ complete: true, findings: [] });
  });

  it('respektiert eine kleinere Grenze', () => {
    const { codes } = generate(scenario('random', 3), { limitBytes: 420 });
    codes.forEach((c) => expect(c.bytes).toBeLessThanOrEqual(420));
  });

  it('erzeugt für alle Szenarien und viele Seeds fehlerfreie Codes', () => {
    for (const s of SCENARIOS) {
      for (let seed = 1; seed <= 40; seed++) {
        const { codes } = generate(s.build(seed));
        for (const c of codes) {
          const errors = validateCode(c.text).findings.filter((f) => f.severity === 'error');
          expect(errors, `${s.id} #${seed}: ${JSON.stringify(errors)}\n${c.text}`).toEqual([]);
          const warnings = validateCode(c.text).findings;
          expect(warnings, `${s.id} #${seed}`).toEqual([]);
        }
      }
    }
  });

  it('misst Byte statt Zeichen', () => {
    expect(utf8Length('Stück')).toBe(6);
    expect(money(-5580)).toBe('-55,80');
  });
});

describe('Fehlerinjektion', () => {
  const r = scenario('random', 5);
  const run = (faults: Parameters<typeof generate>[1] extends infer O ? O extends { faults?: infer F } ? F : never : never) =>
    validateCode(generate(r, { faults }).codes[0].text).findings;

  it('meldet abweichende Summe', () => expect(run({ totalMismatch: true }).map((f) => f.ref)).toContain('K7'));
  it('meldet Ende vor Start', () => expect(run({ endBeforeStart: true }).map((f) => f.ref)).toContain('K6'));
  it('meldet fehlende E-Zeile als Fehler', () => expect(run({ dropE: true }).some((f) => f.severity === 'error' && f.ref === 'Kap. 3.4')).toBe(true));
  it('meldet CRLF', () => expect(run({ crlf: true }).map((f) => f.ref)).toContain('C3'));
  it('meldet fehlende Positionen', () => expect(run({ noPositions: true }).some((f) => f.severity === 'error')).toBe(true));
  it('meldet Steuersatz mit Leerzeichen', () => expect(run({ rateWithSpace: true }).map((f) => f.ref)).toContain('P2'));
});
