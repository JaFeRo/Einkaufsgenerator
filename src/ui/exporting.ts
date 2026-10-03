import JSZip from 'jszip';
import { formatEpoch, money, newSeed, signTse, type SavedBon } from '../dakz';
import { matrixToRgba, type QrMatrix } from '../qr/encode';
import { buildBon, sourceLabel } from './sources';
import type { AppState } from './state';
import { renderBon } from './useCodes';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** QR-Code als PNG mit Beschriftung darunter. */
export async function qrPng(matrix: QrMatrix, caption: string, scale = 8): Promise<Blob> {
  const img = matrixToRgba(matrix, scale);
  const captionH = 28;
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height + captionH;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  ctx.fillStyle = '#111';
  ctx.font = '16px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(caption, canvas.width / 2, img.height + 6);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG-Export fehlgeschlagen'))), 'image/png'));
}

const csvCell = (v: string | number) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/**
 * Serienerzeugung: n Bons eines Szenarios mit neuen Seeds als ZIP.
 * Je Bon: QR-PNG(s), Rohinhalt(e) als .txt und eine Übersicht als CSV.
 */
export async function seriesZip(state: AppState, n: number, bons: SavedBon[], takeBonNr: () => string, onProgress?: (i: number) => void): Promise<Blob> {
  const zip = new JSZip();
  const label = sourceLabel(state.scenarioId, bons);
  const rows: (string | number)[][] = [['bon_nr', 'start_utc', 'ende_utc', 'brutto', 'netto', 'mwst', 'positionen', 'qr_codes', 'fehler', 'warnungen', 'seed']];
  for (let i = 0; i < n; i++) {
    const seed = newSeed();
    const { receipt, template } = buildBon(state.scenarioId, bons, takeBonNr(), seed);
    const options = template ? template.options : state.options;
    const eccOverride = template ? template.eccOverride : state.eccOverride;
    if (state.tseMode === 'ecdsa') Object.assign(receipt, await signTse(receipt).then((t) => ({ tseSignature: t.signature, tsePublicKey: t.publicKey })));
    const bon = renderBon({ receipt, options, eccOverride });
    const dir = zip.folder(`bon-${receipt.bonNr}`)!;
    for (const c of bon.codes) {
      dir.file(`qr-${c.index}-von-${c.count}.txt`, c.text);
      if (c.matrix) dir.file(`qr-${c.index}-von-${c.count}.png`, await qrPng(c.matrix, `Bon ${receipt.bonNr} · QR ${c.index}/${c.count}`));
    }
    dir.file('bon.json', JSON.stringify({ seed, source: label, receipt }, null, 2));
    rows.push([
      receipt.bonNr,
      formatEpoch(receipt.start, true),
      formatEpoch(receipt.end, true),
      money(bon.totals.gross),
      money(bon.totals.net),
      money(bon.totals.vat),
      receipt.positions.length,
      bon.codes.length,
      bon.errors,
      bon.warnings,
      seed
    ]);
    onProgress?.(i + 1);
  }
  zip.file('uebersicht.csv', '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n'));
  zip.file(
    'LIESMICH.txt',
    `dAKZ Bonsimulator – Serienexport\nQuelle: ${label}\nAnzahl: ${n}\nBon-Nummern: fortlaufend vom Zähler, jede nur einmal\n\nAlle Daten sind Testdaten. Die .txt-Dateien enthalten den exakten QR-Inhalt (UTF-8).\n`
  );
  return zip.generateAsync({ type: 'blob' });
}
