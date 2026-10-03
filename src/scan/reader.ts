import { prepareZXingModule, readBarcodes, type ReadResult } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// WASM-Datei aus dem eigenen Build laden statt vom CDN.
prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) }
});

export interface ScannedCode {
  /** Inhalt, als UTF-8 dekodiert */
  text: string;
  /** Rohbytes des Byte-Segments */
  bytes: Uint8Array;
  utf8Valid: boolean;
  ecLevel: string;
  version: string;
  source: string;
}

function toScanned(r: ReadResult, source: string): ScannedCode {
  let text: string;
  let utf8Valid = true;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(r.bytes);
  } catch {
    utf8Valid = false;
    text = r.text;
  }
  return { text, bytes: r.bytes, utf8Valid, ecLevel: r.ecLevel, version: r.version, source };
}

export async function scanImage(input: Blob | ImageData, source: string, thorough = true): Promise<ScannedCode[]> {
  const results = await readBarcodes(input, { formats: ['QRCode'], tryHarder: thorough, maxNumberOfSymbols: 8 });
  return results.filter((r) => r.isValid).map((r) => toScanned(r, source));
}
