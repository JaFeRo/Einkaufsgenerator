import { describe, expect, it } from 'vitest';
import { DOT_MM, printableMm, qrLayout } from '../src/qr/layout';

const modulesOf = (version: number) => 17 + 4 * version;

describe('QR-Größe auf dem Bon', () => {
  it('kleine Codes bleiben klein, die Breite wächst mit der Version', () => {
    const widths = [2, 10, 17, 23, 28].map((v) => qrLayout(modulesOf(v), 4, 80).widthMm);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    expect(new Set(widths).size).toBe(widths.length);
    expect(qrLayout(modulesOf(17), 4, 80)).toMatchObject({ dots: 4, moduleMm: 0.5, widthMm: 46.5, shrunk: false });
    expect(qrLayout(modulesOf(2), 4, 80).widthMm).toBe(16.5);
  });

  it('Modulgröße bleibt konstant, solange der Code aufs Papier passt', () => {
    for (let v = 1; v <= 28; v++) expect(qrLayout(modulesOf(v), 4, 80).dots, `V${v}`).toBe(4);
  });

  it('die Breite wächst nie rückwärts und überschreitet nie die Druckbreite', () => {
    for (const paper of [58, 80] as const) {
      for (const dots of [3, 4, 6] as const) {
        let last = 0;
        for (let v = 1; v <= 40; v++) {
          const l = qrLayout(modulesOf(v), dots, paper);
          expect(l.widthMm, `${paper} mm, ${dots} Punkte, V${v}`).toBeGreaterThanOrEqual(last - 1e-9);
          expect(l.widthMm).toBeLessThanOrEqual(printableMm(paper) + 1e-9);
          expect(l.dots).toBeLessThanOrEqual(dots);
          last = l.widthMm;
        }
      }
    }
  });

  it('verkleinert erst, wenn der Code die Druckbreite füllt', () => {
    const l = qrLayout(modulesOf(30), 4, 80);
    expect(l.shrunk).toBe(true);
    expect(l.widthMm).toBeCloseTo(72, 6);
    expect(qrLayout(modulesOf(28), 4, 80).shrunk).toBe(false);
  });

  it('Version 40: gut 3 Punkte auf 80 mm, gut 2 Punkte auf 58 mm', () => {
    expect(qrLayout(modulesOf(40), 4, 80).dots).toBeCloseTo(72 / 185 / DOT_MM, 6);
    expect(qrLayout(modulesOf(40), 4, 58).dots).toBeCloseTo(48 / 185 / DOT_MM, 6);
    expect(qrLayout(modulesOf(40), 4, 80).dots).toBeGreaterThan(3);
    expect(qrLayout(modulesOf(40), 4, 58).dots).toBeLessThan(3);
  });
});
