/**
 * Unterstützte Fassungen der „Schnittstellendefinition QR-Code“ und ihre Unterschiede.
 * 1.2 (01.09.2026): UTF-8, TSE-Signatur und öffentlicher Schlüssel in E4/E5.
 * 1.3 (26.10.2026, vorgelegt): ISO 8859-1, E4/E5 statt TSE-Daten als RESERVED1/RESERVED2 mit festem Wert „-1“,
 * E6 bleibt die externe Referenz. Die Feldreihenfolge ist in beiden Fassungen gleich.
 */
export type SpecVersion = '1.2' | '1.3';
export type Charset = 'utf-8' | 'iso-8859-1';

export interface SpecProfile {
  version: SpecVersion;
  date: string;
  status: string;
  charset: Charset;
  charsetLabel: string;
  /** E4/E5 enthalten TSE-Signatur und öffentlichen Schlüssel; sonst RESERVED mit Wert „-1“ */
  tse: boolean;
  /** Höchstzahl Zeichen je Code laut Kapitel 5 */
  maxChars: number;
  /** Name der Scan-Anwendung im Text */
  appName: string;
}

export const SPECS: Record<SpecVersion, SpecProfile> = {
  '1.2': {
    version: '1.2',
    date: '01.09.2026',
    status: 'freigegeben',
    charset: 'utf-8',
    charsetLabel: 'UTF-8',
    tse: true,
    maxChars: 2420,
    appName: 'eZOLL-App'
  },
  '1.3': {
    version: '1.3',
    date: '26.10.2026',
    status: 'vorgelegt',
    charset: 'iso-8859-1',
    charsetLabel: 'ISO 8859-1',
    tse: false,
    maxChars: 1663,
    appName: 'KMU-App'
  }
};

export const SPEC_VERSIONS: SpecVersion[] = ['1.2', '1.3'];
export const DEFAULT_SPEC: SpecVersion = '1.3';

export const isSpecVersion = (v: unknown): v is SpecVersion => v === '1.2' || v === '1.3';

export const otherCharset = (c: Charset): Charset => (c === 'utf-8' ? 'iso-8859-1' : 'utf-8');
export const charsetLabel = (c: Charset): string => (c === 'utf-8' ? 'UTF-8' : 'ISO 8859-1');

/** Zeichen, die sich in ISO 8859-1 nicht darstellen lassen. */
export function unencodableLatin1(s: string): string[] {
  return [...new Set([...s].filter((c) => c.codePointAt(0)! > 0xff))];
}

/** Ersetzt nicht darstellbare Zeichen durch „?“, wie es ein Kassensystem ohne Umschreibung täte. */
export function toCharsetText(s: string, charset: Charset): string {
  return charset === 'utf-8' ? s : [...s].map((c) => (c.codePointAt(0)! > 0xff ? '?' : c)).join('');
}

export function encodeText(s: string, charset: Charset): Uint8Array {
  if (charset === 'utf-8') return new TextEncoder().encode(s);
  return Uint8Array.from([...s], (c) => {
    const cp = c.codePointAt(0)!;
    return cp > 0xff ? 0x3f : cp;
  });
}

export function byteLength(s: string, charset: Charset): number {
  return encodeText(s, charset).length;
}

export interface DecodedBytes {
  text: string;
  /** Tatsächlich erkannte Kodierung */
  detected: Charset | 'ascii';
}

/**
 * Bytes eines gescannten Codes lesen. Enthält er gültige UTF-8-Mehrbytefolgen, ist er UTF-8;
 * sonst ISO 8859-1. Reine ASCII-Inhalte sind in beiden Kodierungen gleich.
 */
export function decodeBytes(bytes: Uint8Array): DecodedBytes {
  if (bytes.every((b) => b < 0x80)) return { text: new TextDecoder('latin1').decode(bytes), detected: 'ascii' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), detected: 'utf-8' };
  } catch {
    return { text: String.fromCharCode(...bytes), detected: 'iso-8859-1' };
  }
}

/**
 * Fassung eines Codes erkennen. Der Code selbst nennt keine Version; beide Fassungen haben dieselben
 * Felder, unterscheiden sich aber in E4/E5: 1.3 schreibt dort fest „-1“, 1.2 die TSE-Daten.
 * Folgecodes haben keine E-Zeile und lassen sich nur über ihren Primärcode zuordnen.
 */
export function detectSpec(records: string[][]): { version: SpecVersion | null; reason: string } {
  const e = records.find((r) => r[0] === 'E');
  if (!e) return { version: null, reason: 'Folgecode ohne E-Zeile' };
  if (e[3] === '-1' && e[4] === '-1') return { version: '1.3', reason: 'E4/E5 = -1 (RESERVED)' };
  if (e.length > 4) return { version: '1.2', reason: 'E4/E5 mit TSE-Daten' };
  return { version: null, reason: `E-Zeile mit ${e.length - 1} Feldern, keiner Fassung zuzuordnen` };
}
