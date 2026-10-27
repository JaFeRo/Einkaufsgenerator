import { decodeBytes, type Charset } from '../dakz/spec';
import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// WASM-Datei aus dem eigenen Build laden statt vom CDN.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }
});

export interface ScannedCode {
  /** Inhalt, in der erkannten Kodierung dekodiert */
  text: string;
  /** Kodierung der Rohbytes (UTF-8 nur bei gültigen Mehrbytefolgen, sonst ISO 8859-1) */
  detected: Charset | 'ascii';
  ecLevel: string;
  version: string;
  source: string;
}

function toScanned(r: ReadResult, source: string): ScannedCode {
  // Selbst dekodieren: zxing rät die Kodierung ohne ECI und kann ISO 8859-1 als anderes Charset lesen.
  const { text, detected } = decodeBytes(r.bytes);
  return { text, detected, ecLevel: r.ecLevel, version: r.version, source };
}

export async function scanImage(input: Blob | ImageData, source: string, thorough = true): Promise<ScannedCode[]> {
  const results = await readBarcodes(input, { formats: ['QRCode'], tryHarder: thorough, maxNumberOfSymbols: 8 });
  return results.filter((r) => r.isValid).map((r) => toScanned(r, source));
}
