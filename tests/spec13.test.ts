import { describe, expect, it } from 'vitest';
import ex from '../src/dakz/zoll-beispiele-13.json';
import { RX13, SCENARIOS, decodeBytes, detectSpec, encodeText, generate, parseContent, validateCode, validateSet } from '../src/dakz';

const scenario = (id: string, seed = 1) => SCENARIOS.find((s) => s.id === id)!.build(seed);
const bytesOf = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'));
const refs = (f: { findings: { ref?: string; severity: string }[] }, sev: string) => f.findings.filter((x) => x.severity === sev).map((x) => x.ref);

describe('Fassung 1.3: Erzeugung', () => {
  it('erzeugt den Datensatz aus Abbildung 4 (ohne TSE, ohne K8)', () => {
    const { codes } = generate(scenario('zoll61'), { spec: '1.3', writeVersion: false, trailingLF: false });
    expect(codes[0].text).toBe(ex.abb4_text);
  });

  it('kodiert in ISO 8859-1: „Stück“ ist ein Byte FC', () => {
    const { codes } = generate(scenario('zoll61'), { spec: '1.3' });
    const c = codes[0];
    expect(c.charset).toBe('iso-8859-1');
    expect(c.bytes).toBe(c.chars);
    expect(Array.from(c.data)).toContain(0xfc);
    expect(Array.from(c.data)).not.toContain(0xc3);
  });

  it('schreibt K8 = 1.3 auf Wunsch, auch in Folgecodes', () => {
    const { codes } = generate(scenario('overflow', 3), { spec: '1.3', writeVersion: true });
    expect(codes.length).toBeGreaterThan(1);
    codes.forEach((c) => expect(parseContent(c.text)[0][7]).toBe('1.3'));
  });

  it('1.2 schreibt TSE-Felder und kein K8, 1.3 nicht', () => {
    const r = scenario('random', 4);
    const e12 = parseContent(generate(r, { spec: '1.2' }).codes[0].text).find((x) => x[0] === 'E')!;
    const e13 = parseContent(generate(r, { spec: '1.3' }).codes[0].text).find((x) => x[0] === 'E')!;
    expect(e12).toHaveLength(6);
    expect(e13).toEqual(['E', e12[1], e12[2], e12[5]]);
  });

  it('ersetzt Zeichen außerhalb von ISO 8859-1 durch „?“ und meldet sie', () => {
    const r = scenario('special');
    r.positions[0].text = 'Kerze „Advent“ – 10 €';
    const res = generate(r, { spec: '1.3' });
    expect(res.replaced.sort()).toEqual(['–', '€', '“', '„'].sort());
    expect(res.codes[0].text).toContain('Kerze ?Advent? ? 10 ?');
    expect(generate(r, { spec: '1.2' }).replaced).toEqual([]);
  });

  it('Fehlerinjektion: UTF-8 statt ISO 8859-1', () => {
    const c = generate(scenario('zoll61'), { spec: '1.3', faults: { wrongCharset: true } }).codes[0];
    expect(c.charset).toBe('utf-8');
    expect(validateCode(c.text, { spec: '1.3', detectedCharset: decodeBytes(c.data).detected }).findings.map((f) => f.ref)).toContain('V3/C2');
  });

  it('erzeugt für alle Szenarien fehlerfreie 1.3-Codes', () => {
    for (const s of SCENARIOS)
      for (let seed = 1; seed <= 15; seed++)
        for (const c of generate(s.build(seed), { spec: '1.3' }).codes) {
          const check = validateCode(c.text, { spec: '1.3', detectedCharset: decodeBytes(c.data).detected });
          expect(check.findings, `${s.id} #${seed}\n${c.text}`).toEqual([]);
        }
  });
});

describe('Fassung 1.3: Prüfung der Dokument-Beispiele', () => {
  const read = (k: 'abb5' | 'abb7' | 'abb9' | 'abb11') => decodeBytes(bytesOf(ex[k]));

  it('alle Beispielcodes sind UTF-8 statt ISO 8859-1', () => {
    for (const k of ['abb5', 'abb7', 'abb9', 'abb11'] as const) expect(read(k).detected, k).toBe('utf-8');
  });

  it('Abb. 7 (6.2): CRLF und falsche Kodierung, Summen stimmen', () => {
    const d = read('abb7');
    const check = validateCode(d.text, { spec: '1.3', detectedCharset: d.detected });
    expect(refs(check, 'error')).toEqual(expect.arrayContaining(['C3', 'V3/C2']));
    expect(refs(check, 'warning').filter((r) => r === 'E2' || r === 'E3')).toEqual([]);
  });

  it('Abb. 9 + 11 (6.3): E2/E3 passen nicht zu den M-Zeilen', () => {
    const a = read('abb9');
    const check = validateCode(a.text, { spec: '1.3', detectedCharset: a.detected });
    expect(refs(check, 'warning')).toEqual(expect.arrayContaining(['E2', 'E3']));
    expect(validateSet([a.text, read('abb11').text]).complete).toBe(true);
  });

  it('Abb. 5 (6.1) ist noch ein 1.2-Code mit TSE-Feldern', () => {
    const recs = parseContent(read('abb5').text);
    expect(detectSpec(recs).version).toBe('1.2');
    expect(detectSpec(parseContent(read('abb7').text)).version).toBe('1.3');
  });
});

describe('Fassung 1.3: reguläre Ausdrücke', () => {
  it('P4 wörtlich wie im Dokument', () => {
    expect(['49999,99', '-49999,99', '0,00', '0', '50000', '1234,56'].every((v) => RX13.pBrutto.test(v))).toBe(true);
    expect(['50000,00', '-50000,00', '05,00', '50000,01', '1,5'].some((v) => RX13.pBrutto.test(v))).toBe(false);
  });
  it('M3–M5 ohne führende Null', () => {
    expect(RX13.mBetrag.test('012,00')).toBe(false);
    expect(RX13.mBetrag.test('-3,00')).toBe(true);
  });
  it('meldet 50.000,00 als Widerspruch zwischen Text und Regex', () => {
    const text = 'K;1;;5;1770201944;1770201945;50000,00\nE;42016,81;7983,19\nM;19;50000,00;42016,81;7983,19\nP;19;1;50000,00;1;Stück;Auto\n';
    const f = validateCode(text, { spec: '1.3' }).findings.find((x) => x.ref === 'P4')!;
    expect(f.severity).toBe('error');
    expect(f.message).toContain('Text erlaubt');
  });
  it('encodeText ISO 8859-1 ersetzt fremde Zeichen', () => {
    expect(Array.from(encodeText('ü€', 'iso-8859-1'))).toEqual([0xfc, 0x3f]);
  });
});
