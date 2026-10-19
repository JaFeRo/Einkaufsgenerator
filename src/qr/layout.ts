/**
 * Physische Größe eines QR-Codes auf dem Bon.
 * Thermodrucker setzen ganze Druckpunkte: 203 dpi entsprechen 0,125 mm je Punkt. Ein Modul besteht aus
 * einer festen Zahl Punkte, der Code wächst also mit der Version. Erst wenn er breiter würde als der
 * bedruckbare Bereich, füllt er genau diese Breite aus und die Module werden kleiner. Dadurch wächst die
 * Breite mit dem Inhalt nie rückwärts. Ein Bondrucker, der nur ganze Punkte kann, rundet dabei ab.
 */
export const DOT_MM = 0.125;
export const QUIET_MODULES = 4;
export type ModuleDots = 3 | 4 | 6;
export const MODULE_DOT_CHOICES: ModuleDots[] = [3, 4, 6];
export const DEFAULT_MODULE_DOTS: ModuleDots = 4;

/** Bedruckbare Breite handelsüblicher Bondrucker: 80-mm-Papier druckt 72 mm, 58-mm-Papier 48 mm. */
export const printableMm = (paper: 58 | 80): number => (paper === 58 ? 48 : 72);

export interface QrLayout {
  /** Gewünschte Punkte je Modul */
  targetDots: number;
  /** Tatsächliche Punkte je Modul (kann nach dem Verkleinern gebrochen sein), nie mehr als gewünscht */
  dots: number;
  moduleMm: number;
  /** Breite inklusive Ruhezone in mm */
  widthMm: number;
  /** Auf Papierbreite verkleinert */
  shrunk: boolean;
}

export function qrLayout(modules: number, targetDots: number, paper: 58 | 80): QrLayout {
  const total = modules + QUIET_MODULES * 2;
  const fit = printableMm(paper) / (total * DOT_MM);
  const dots = Math.min(targetDots, fit);
  return { targetDots, dots, moduleMm: dots * DOT_MM, widthMm: total * dots * DOT_MM, shrunk: dots < targetDots };
}

export const fmtMm = (mm: number, digits = 1): string => mm.toFixed(digits).replace('.', ',');

export const fmtDots = (d: number): string => (Number.isInteger(d) ? String(d) : d.toFixed(1).replace('.', ','));
