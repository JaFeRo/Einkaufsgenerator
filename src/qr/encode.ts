import qrcode from 'qrcode-generator';
import type { EccLevel } from '../dakz/types';

// UTF-8 statt Latin-1: Umlaute wie in „Stück“ müssen als Mehrbyte-Folge im Byte-Modus landen.
qrcode.stringToBytes = (s: string) => Array.from(new TextEncoder().encode(s));

export interface QrMatrix {
  /** Kantenlänge in Modulen (ohne Ruhezone) */
  size: number;
  /** QR-Version 1–40 */
  version: number;
  ecc: EccLevel;
  /** Zeilenweise: true = dunkles Modul */
  modules: boolean[][];
}

export class QrCapacityError extends Error {}

/** Kodiert Text im Byte-Modus mit kleinstmöglicher Version (V2 der Spezifikation). */
export function encodeQr(text: string, ecc: EccLevel): QrMatrix {
  const q = qrcode(0, ecc);
  q.addData(text, 'Byte');
  try {
    q.make();
  } catch {
    throw new QrCapacityError(`Inhalt passt nicht in QR-Version 40 mit Fehlerkorrektur ${ecc}`);
  }
  const size = q.getModuleCount();
  const modules = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => q.isDark(y, x)));
  return { size, version: (size - 17) / 4, ecc, modules };
}

/** SVG-Pfad aller dunklen Module, versetzt um die Ruhezone. */
export function matrixPath(m: QrMatrix, quiet = 4): string {
  let d = '';
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (!m.modules[y][x]) {
        x++;
        continue;
      }
      const startX = x;
      while (x < m.size && m.modules[y][x]) x++;
      d += `M${startX + quiet} ${y + quiet}h${x - startX}v1h${startX - x}z`;
    }
  }
  return d;
}

/** Graustufen-RGBA-Bild der Matrix (für PNG-Export und Tests). */
export function matrixToRgba(m: QrMatrix, scale = 4, quiet = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const dim = (m.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255);
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++) {
      if (!m.modules[y][x]) continue;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * dim + (x + quiet) * scale + dx) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
    }
  return { data, width: dim, height: dim };
}
