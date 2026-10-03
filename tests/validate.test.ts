import { describe, expect, it } from 'vitest';
import examples from '../src/dakz/zoll-beispiele.json';
import { RX, parseRecord, validateCode, validateSet } from '../src/dakz';

const refs = (text: string, severity: 'error' | 'warning') =>
  validateCode(text, { limitBytes: 2331 }).findings.filter((f) => f.severity === severity).map((f) => f.ref);

describe('Zoll-Beispiele', () => {
  it('6.1 ist gültig, nur das fehlende LF wird angemerkt', () => {
    expect(refs(examples.ex61, 'error')).toEqual([]);
    expect(refs(examples.ex61, 'warning')).toEqual(['EBNF']);
  });
  it('6.2 ist gültig, aber E2/E3 passen nicht zu den M-Zeilen', () => {
    expect(refs(examples.ex62, 'error')).toEqual([]);
    expect(refs(examples.ex62, 'warning')).toEqual(expect.arrayContaining(['E2', 'E3']));
  });
  it('6.3 Primärcode: Summen weichen ab, Code ist für ECC Q zu groß', () => {
    expect(refs(examples.ex63a, 'warning')).toEqual(expect.arrayContaining(['K7', 'E2']));
    const strict = validateCode(examples.ex63a).findings;
    expect(strict.some((f) => f.severity === 'error' && f.ref === 'Kap. 5')).toBe(true);
  });
  it('6.3 Primärcode allein ist unvollständig', () => {
    const set = validateSet([examples.ex63a]);
    expect(set.complete).toBe(false);
    expect(set.expected).toBe(2);
    expect(set.findings.map((f) => f.message).join()).toContain('Es fehlen Code 2 von 2');
  });
});

describe('Regex-Grenzwerte', () => {
  const cases: [keyof typeof RX, string[], string[]][] = [
    ['bonNr', ['1', '302592', '999999999999', '1000000000000'], ['0', '0123', '1000000000001', '12a']],
    ['kBrutto', ['50,01', '51,00', '105,20', '49999999,99'], ['50,00', '49,99', '50', '50,1', '50000000,00', '0,00']],
    ['eBetrag', ['0,01', '88,40', '49999999,99'], ['0,00', '-1,00', '088,40']],
    ['satz', ['19', '7', '19,00', '7,5'], ['19 ', '19.00', '100', '19,000']],
    // Die Spec-Regex lässt 50000,01–50000,99 zu, obwohl der Text „zwischen −50.000 und 50.000“ sagt (siehe Plan).
    ['pBrutto', ['0,00', '105,20', '-55,80', '50000,00', '-50000,00', '49999,99', '50000,99'], ['50001,00', '1,5', '']],
    ['menge', ['1', '0,648', '99999,999', '2'], ['0', '0,000', '100000', '1,2345', '-1']],
    ['mBetrag', ['0,00', '-3,00', '49999999,99'], ['1,0', '']],
    ['epoch', ['1770201944'], ['177020194', '17702019440']],
    ['flag', ['0', '1'], ['2', '']]
  ];
  for (const [key, ok, bad] of cases) {
    it(key, () => {
      ok.forEach((v) => expect(RX[key].test(v), `${key} „${v}“ sollte gültig sein`).toBe(true));
      bad.forEach((v) => expect(RX[key].test(v), `${key} „${v}“ sollte ungültig sein`).toBe(false));
    });
  }
});

describe('Parser', () => {
  it('liest maskierte Felder', () => {
    expect(parseRecord('P;19;1;59,90;1;Stück;"A ""B""; C"')).toEqual(['P', '19', '1', '59,90', '1', 'Stück', 'A "B"; C']);
  });
  it('ignoriert zusätzliche Felder mit Warnung (Toleranzprinzip)', () => {
    const text = examples.ex62.replace('P;7;1;3,50;1;Stück;Nasenspray', 'P;7;1;3,50;1;Stück;Nasenspray;NEU');
    const f = validateCode(text).findings;
    expect(f.filter((x) => x.severity === 'error')).toEqual([]);
    expect(f.some((x) => x.message.includes('unbekannte'))).toBe(true);
  });
  it('erkennt Codes verschiedener Bons', () => {
    const set = validateSet([examples.ex61, examples.ex62]);
    expect(set.findings.some((f) => f.ref === 'K4–K7')).toBe(true);
  });
});
