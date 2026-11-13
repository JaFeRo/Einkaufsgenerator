import { describe, expect, it } from 'vitest';
import { allocateBonNr, validateCode } from '../src/dakz';
import { SCAN_TEST_VERSIONS, buildScanTest, snapModulePx } from '../src/ui/scanTest';

const counter = () => {
  let s = { next: 500001, issued: [] as string[] };
  return () => {
    const r = allocateBonNr(s);
    s = r.state;
    return r.bonNr;
  };
};

describe('Scan-Test', () => {
  for (const spec of ['1.2', '1.3'] as const) {
    it(`Fassung ${spec}: Funktionstest, dann steigende Versionen mit eigener BON_NR`, () => {
      const steps = buildScanTest(spec, counter(), Date.UTC(2026, 10, 13));
      expect(steps[0].matrix.version).toBe(1);
      expect(steps[0].bonNr).toBeUndefined();
      const versions = steps.slice(1).map((s) => s.matrix.version);
      expect(versions.length).toBe(SCAN_TEST_VERSIONS.length);
      versions.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(SCAN_TEST_VERSIONS.at(i)!));
      expect([...versions].sort((a, b) => a - b)).toEqual(versions);
      expect(new Set(steps.slice(1).map((s) => s.bonNr)).size).toBe(versions.length);
    });
  }

  for (const spec of ['1.2', '1.3'] as const)
    it(`Fassung ${spec}: die dAKZ-Schritte sind fehlerfreie Bons`, () => {
      for (const s of buildScanTest(spec, counter(), Date.UTC(2026, 10, 13)).slice(1)) {
        const errors = validateCode(s.text, { spec }).findings.filter((f) => f.severity === 'error');
        expect(errors, s.label).toEqual([]);
        expect(s.text).toContain(`;${s.bonNr};`);
      }
    });

  it('Bildpunkte je Modul sind ganzzahlig in Gerätepixeln', () => {
    expect(snapModulePx(890, 65, 1)).toBe(13);
    expect(snapModulePx(890, 65, 2)).toBe(13.5);
    expect(snapModulePx(300, 185, 1)).toBe(1);
    expect(snapModulePx(10, 185, 1)).toBe(1);
  });
});
