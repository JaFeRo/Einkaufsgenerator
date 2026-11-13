/**
 * ESC/POS-Befehle für Thermo-Bondrucker (Epson-kompatibel). Reine Byte-Erzeugung, ohne Verbindung.
 * Der QR-Code wird wie bei python-escpos als Rasterbild gesendet (GS v 0), auf Wunsch auch als
 * druckerinterner QR-Befehl (GS ( k) mit exakt den Bytes des Inhalts.
 */
import type { EccLevel } from '../dakz';
import { QUIET_MODULES } from '../qr/layout';
import type { QrMatrix } from '../qr/encode';

export const ESC = 0x1b;
export const GS = 0x1d;
export const FS = 0x1c;

/** Zeichentabellen für Bontext; die Nummer ist der Parameter von ESC t (Epson-Belegung). */
export type CodePage = 'pc850' | 'pc858' | 'wpc1252' | 'ascii';
export const CODE_PAGES: { id: CodePage; label: string; escT: number | null }[] = [
  { id: 'pc850', label: 'PC850 (ESC t 2)', escT: 2 },
  { id: 'pc858', label: 'PC858 mit € (ESC t 19)', escT: 19 },
  { id: 'wpc1252', label: 'Windows-1252 (ESC t 16)', escT: 16 },
  { id: 'ascii', label: 'Nur ASCII (Umlaute als ae, oe …)', escT: null }
];

// Westeuropäische Zeichen in PC850; PC858 ist gleich, nur mit € auf 0xD5.
const PC850: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87, ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b, î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f,
  É: 0x90, æ: 0x91, Æ: 0x92, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97, ÿ: 0x98, Ö: 0x99, Ü: 0x9a, ø: 0x9b, '£': 0x9c, Ø: 0x9d, '×': 0x9e,
  á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7, '¿': 0xa8, '®': 0xa9, '½': 0xab, '¼': 0xac, '¡': 0xad, '«': 0xae, '»': 0xaf,
  Á: 0xb5, Â: 0xb6, À: 0xb7, '©': 0xb8, ã: 0xc6, Ã: 0xc7, Ê: 0xd2, Ë: 0xd3, È: 0xd4, Í: 0xd6, Î: 0xd7, Ï: 0xd8, Ì: 0xde, Ó: 0xe0, ß: 0xe1, Ô: 0xe2,
  Ò: 0xe3, õ: 0xe4, Õ: 0xe5, 'µ': 0xe6, Ú: 0xe9, Û: 0xea, Ù: 0xeb, ý: 0xec, Ý: 0xed, '´': 0xef, '±': 0xf1, '¾': 0xf3, '§': 0xf5, '÷': 0xf6, '°': 0xf8,
  '·': 0xfa, '¹': 0xfb, '³': 0xfc, '²': 0xfd
};

// Ersatz für Zeichen, die keine Tabelle hat (typografische Zeichen aus dem Bon)
const FALLBACK: Record<string, string> = { '–': '-', '—': '-', '„': '"', '“': '"', '”': '"', '‚': "'", '‘': "'", '’': "'", '…': '...', '€': 'EUR' };
const ASCII: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss', '·': '-', '×': 'x', é: 'e', è: 'e', ê: 'e', à: 'a', ç: 'c' };

/** Text in die Bytes der gewählten Zeichentabelle; Unbekanntes wird ersetzt oder zu „?“. */
export function encodeText(text: string, cp: CodePage): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    if (cp === 'wpc1252') {
      if (ch === '€') out.push(0x80);
      else if (code <= 0xff) out.push(code);
      else for (const c of FALLBACK[ch] ?? '?') out.push(c.charCodeAt(0));
      continue;
    }
    if (cp === 'pc858' && ch === '€') {
      out.push(0xd5);
      continue;
    }
    if (cp !== 'ascii' && PC850[ch] !== undefined) {
      out.push(PC850[ch]);
      continue;
    }
    for (const c of (cp === 'ascii' ? ASCII[ch] : undefined) ?? FALLBACK[ch] ?? '?') out.push(c.charCodeAt(0));
  }
  return out;
}

export type Align = 'left' | 'center' | 'right';

/** Baut einen Druckauftrag Befehl für Befehl. */
export class EscPos {
  private bytes: number[] = [];
  constructor(private cp: CodePage) {}

  raw(...b: number[]) {
    this.bytes.push(...b);
    return this;
  }
  /** ESC @, Kanji-Modus aus (manche Drucker starten im chinesischen Modus), Zeichentabelle */
  init() {
    this.raw(ESC, 0x40, FS, 0x2e);
    const t = CODE_PAGES.find((c) => c.id === this.cp)?.escT;
    if (t !== null && t !== undefined) this.raw(ESC, 0x74, t);
    return this;
  }
  align(a: Align) {
    return this.raw(ESC, 0x61, a === 'left' ? 0 : a === 'center' ? 1 : 2);
  }
  bold(on: boolean) {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }
  /** GS ! – Breite und Höhe je 1- oder 2-fach */
  size(wide: boolean, tall: boolean) {
    return this.raw(GS, 0x21, (wide ? 0x10 : 0) | (tall ? 0x01 : 0));
  }
  text(s: string) {
    return this.raw(...encodeText(s, this.cp));
  }
  line(s = '') {
    return this.text(s).raw(0x0a);
  }
  feed(lines: number) {
    return this.raw(ESC, 0x64, Math.max(0, Math.min(255, lines)));
  }
  /** GS V 66 n: Papier vorschieben und schneiden (wie python-escpos cut()) */
  cut() {
    return this.raw(GS, 0x56, 66, 0);
  }
  /**
   * Rasterbild (GS v 0): eine Zeile je Bildpunktreihe, 8 Punkte je Byte, MSB links.
   * In Streifen von höchstens 960 Zeilen, wie python-escpos, damit kleine Druckerpuffer reichen.
   */
  raster(widthDots: number, rows: (y: number, x: number) => boolean, height: number) {
    const wb = Math.ceil(widthDots / 8);
    for (let y0 = 0; y0 < height; y0 += 960) {
      const h = Math.min(960, height - y0);
      this.raw(GS, 0x76, 0x30, 0, wb & 0xff, wb >> 8, h & 0xff, h >> 8);
      for (let y = y0; y < y0 + h; y++)
        for (let bx = 0; bx < wb; bx++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const x = bx * 8 + bit;
            if (x < widthDots && rows(y, x)) byte |= 0x80 >> bit;
          }
          this.bytes.push(byte);
        }
    }
    return this;
  }
  /** QR-Code als Rasterbild über die ganze Druckbreite, zentriert, mit 4 Modulen Ruhezone. */
  qrRaster(m: QrMatrix, dots: number, widthDots: number) {
    const total = m.size + QUIET_MODULES * 2;
    const left = Math.floor((widthDots - total * dots) / 2);
    const dark = (y: number, x: number) => {
      const mx = Math.floor((x - left) / dots) - QUIET_MODULES;
      const my = Math.floor(y / dots) - QUIET_MODULES;
      return mx >= 0 && my >= 0 && mx < m.size && my < m.size && m.modules[my][mx];
    };
    return this.raster(widthDots, dark, total * dots);
  }
  /**
   * Druckerinterner QR-Befehl (GS ( k, Modell 2). Die Bytes gehen unverändert an den Drucker,
   * ohne ECI; ob die Firmware die Version selbst wählt und wie groß sie werden kann, hängt vom Gerät ab.
   */
  qrNative(data: Uint8Array, dots: number, ecc: EccLevel) {
    // GS ( k pL pH 49 fn … – pL/pH zählen die Bytes ab „49“
    const fn = (code: number, ...rest: number[]) => {
      const len = rest.length + 2;
      this.raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, code, ...rest);
    };
    fn(0x41, 0x32, 0x00); // Modell 2
    fn(0x43, Math.max(1, Math.min(16, dots))); // Modulgröße
    fn(0x45, { L: 48, M: 49, Q: 50, H: 51 }[ecc]); // Fehlerkorrektur
    const len = data.length + 3;
    this.raw(GS, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30);
    for (const b of data) this.bytes.push(b);
    fn(0x51, 0x30); // drucken
    return this;
  }
  build(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

/** Zeichen je Zeile in Schrift A (12 Punkte breit) */
export const columnsFor = (widthDots: number) => Math.floor(widthDots / 12);

/** Größte ganze Punktzahl je Modul, höchstens die gewünschte, damit der Code in die Druckbreite passt. */
export function rasterDots(m: QrMatrix, wanted: number, widthDots: number): number {
  return Math.min(wanted, Math.floor(widthDots / (m.size + QUIET_MODULES * 2)));
}
