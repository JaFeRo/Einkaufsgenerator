import { money, parseMoney } from './format';
import { QR_CAPACITY_Q_BYTES } from './generate';
import { SPECS, byteLength, detectSpec, type Charset, type SpecVersion } from './spec';
import type { CodeCheck, Finding } from './types';

/**
 * Reguläre Ausdrücke aus Kapitel 4 der Spezifikation 1.2.
 * Korrektur: Bei P2/M2 enthält das PDF ein Leerzeichen vor dem Komma, das hier entfällt.
 */
export const RX = {
  nr: /^\d{1,3}$/,
  bonNr: /^[1-9]\d{0,11}$|^10{12}$/,
  epoch: /^\d{10}$/,
  kBrutto: /^(?!50,00$)([5-9]\d|[1-9]\d{2,6}|[1-4]\d{7}),\d{2}$/,
  eBetrag: /^(?!0,00$)(0|[1-9]\d{0,6}|[1-4]\d{7}),\d{2}$/,
  tse: /^.{1,512}$/,
  ref: /^.{0,255}$/,
  satz: /^\d{1,2}(,\d{1,2})?$/,
  flag: /^[01]$/,
  pBrutto: /^(-?[1-4]?\d{1,4}|-?50000|0),\d{2}$/,
  menge: /^(?!0(,0{1,3})?$)(0,\d{1,3}|[1-9]\d{0,4}(,\d{1,3})?)$/,
  einheit: /^.{0,50}$/,
  text: /^.{1,255}$/,
  mBetrag: /^-?([0-4]?\d{1,7}),\d{2}$/
} as const;

/** Geänderte Ausdrücke in 1.3, wörtlich aus dem Dokument übernommen. */
export const RX13 = {
  pBrutto: /^(?!-?0\d)(-?[1-4]?\d{1,4},\d{2}|-?50000|0)$/,
  mBetrag: /^(?!-?0\d)(-?[0-4]?\d{1,7}),\d{2}$/,
  version: /^.{0,7}$/
} as const;

export interface FieldSpec {
  id: string;
  name: string;
  rx: RegExp;
  required: boolean;
  hint: string;
}

const f = (id: string, name: string, rx: RegExp, required: boolean, hint: string): FieldSpec => ({ id, name, rx, required, hint });

type LineType = 'K' | 'E' | 'M' | 'P';

const SPEC_12: Record<LineType, FieldSpec[]> = {
  K: [
    f('K2', 'Nummer', RX.nr, true, 'fortlaufende Nummer des QR-Codes, 1–3 Ziffern'),
    f('K3', 'Gesamtanzahl', RX.nr, false, 'Anzahl der QR-Codes, leer = 1'),
    f('K4', 'BON_NR', RX.bonNr, true, 'Bonnummer ohne führende Null'),
    f('K5', 'BON_START', RX.epoch, true, 'Unix-Sekunden UTC, 10 Ziffern'),
    f('K6', 'BON_ENDE', RX.epoch, true, 'Unix-Sekunden UTC, 10 Ziffern'),
    f('K7', 'UMS_BRUTTO', RX.kBrutto, true, 'über 50,00 und unter 50.000.000')
  ],
  E: [
    f('E2', 'UMS_NETTO', RX.eBetrag, true, 'größer 0, zwei Nachkommastellen'),
    f('E3', 'MWST', RX.eBetrag, true, 'größer 0, zwei Nachkommastellen'),
    f('E4', 'TSE_TA_SIG', RX.tse, true, 'Base64, 1–512 Zeichen'),
    f('E5', 'TSE_PUBLIC_KEY', RX.tse, true, 'Base64, 1–512 Zeichen'),
    f('E6', 'externeKundenReferenz', RX.ref, false, 'frei wählbar, bis 255 Zeichen')
  ],
  M: [
    f('M2', 'MWST_SATZ', RX.satz, true, 'z. B. 19 oder 7,00'),
    f('M3', 'UMS_BRUTTO', RX.mBetrag, true, 'zwei Nachkommastellen'),
    f('M4', 'UMS_NETTO', RX.mBetrag, true, 'zwei Nachkommastellen'),
    f('M5', 'MWST', RX.mBetrag, true, 'zwei Nachkommastellen')
  ],
  P: [
    f('P2', 'MWST_SATZ', RX.satz, true, 'z. B. 19 oder 7,00'),
    f('P3', 'ERSTATTUNGSFAEHIG', RX.flag, false, '0 oder 1, leer = 1'),
    f('P4', 'UMS_BRUTTO', RX.pBrutto, true, '−50.000,00 bis 50.000,00'),
    f('P5', 'MENGE', RX.menge, false, 'größer 0, bis 3 Nachkommastellen'),
    f('P6', 'EINHEIT', RX.einheit, false, 'bis 50 Zeichen, leer = Stück'),
    f('P7', 'ARTIKELTEXT', RX.text, true, '1–255 Zeichen')
  ]
};

const SPEC_13: Record<LineType, FieldSpec[]> = {
  K: [...SPEC_12.K, f('K8', 'Versionsnummer', RX13.version, false, 'bis 7 Zeichen, z. B. 1.3')],
  E: [
    SPEC_12.E[0],
    SPEC_12.E[1],
    f('E4', 'externeKundenReferenz', RX.ref, false, 'frei wählbar, bis 255 Zeichen')
  ],
  M: [
    SPEC_12.M[0],
    f('M3', 'UMS_BRUTTO', RX13.mBetrag, true, 'zwei Nachkommastellen, ohne führende Null'),
    f('M4', 'UMS_NETTO', RX13.mBetrag, true, 'zwei Nachkommastellen, ohne führende Null'),
    f('M5', 'MWST', RX13.mBetrag, true, 'M3 − M4, zwei Nachkommastellen')
  ],
  P: SPEC_12.P.map((x) => (x.id === 'P4' ? f('P4', 'UMS_BRUTTO', RX13.pBrutto, true, '−49.999,99 bis 49.999,99, ±50000 oder 0') : x))
};

export function fieldSpecs(version: SpecVersion): Record<LineType, FieldSpec[]> {
  return version === '1.2' ? SPEC_12 : SPEC_13;
}

/** Feldtabelle der Fassung 1.2 (für Rückwärtskompatibilität). */
export const SPEC = SPEC_12;

/** Zerlegt eine Zeile nach RFC 4180 mit Semikolon als Trenner. */
export function parseRecord(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseContent(text: string): string[][] {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => l.length > 0)
    .map(parseRecord);
}

const sumCol = (rows: string[][], i: number) => rows.reduce((a, r) => a + (parseMoney(r[i] ?? '') || 0), 0);

export interface ValidateOptions {
  limitBytes?: number;
  /** Fassung, nach der geprüft wird; ohne Angabe wird sie aus dem Inhalt erkannt (Standard 1.3) */
  spec?: SpecVersion;
  /** Kodierung, in der die Bytes vorlagen (bei gescannten Codes) */
  detectedCharset?: Charset | 'ascii';
}

/** Prüft den Inhalt eines einzelnen QR-Codes gegen Kapitel 3 und 4. */
export function validateCode(text: string, opts: ValidateOptions = {}): CodeCheck {
  const findings: Finding[] = [];
  const err = (message: string, ref?: string, line?: number) => findings.push({ severity: 'error', message, ref, line });
  const warn = (message: string, ref?: string, line?: number) => findings.push({ severity: 'warning', message, ref, line });

  const records = parseContent(text);
  const spec: SpecVersion = opts.spec ?? detectSpec(records).version ?? '1.3';
  const profile = SPECS[spec];
  const SPECF = fieldSpecs(spec);

  const d = opts.detectedCharset;
  // Gescannte Codes in ihrer tatsächlichen Kodierung messen, sonst in der der Fassung
  const bytes = byteLength(text, d && d !== 'ascii' ? d : profile.charset);
  const limit = opts.limitBytes ?? QR_CAPACITY_Q_BYTES;
  if (/\r/.test(text)) err('Zeilenumbruch muss LF sein, CR gefunden', 'C3');
  if (bytes > limit) err(`Inhalt hat ${bytes} Byte, Grenze für einen Code ist ${limit}`, 'Kap. 5');
  if (text.length > profile.maxChars) err(`Mehr als ${profile.maxChars.toLocaleString('de-DE')} Zeichen in einem Code`, 'Kap. 5');
  if (text.length && !text.endsWith('\n')) warn('Letzte Zeile endet ohne LF (EBNF verlangt LF je record)', 'EBNF');
  if (d && d !== 'ascii' && d !== profile.charset)
    err(`Zeichenkodierung ${d === 'utf-8' ? 'UTF-8' : 'ISO 8859-1'}, Spezifikation ${spec} verlangt ${profile.charsetLabel}`, spec === '1.3' ? 'V3/C2' : 'C2');
  const k = records[0]?.[0] === 'K' ? records[0] : undefined;
  const primary = k?.[1] === '1';

  const types = records.map((r) => r[0]).join('');
  const order = primary ? /^KEM{1,5}P{1,1000}$/ : /^KP{1,1000}$/;
  if (!records.length) err('Kein Inhalt');
  else if (!order.test(types)) {
    const compact = types.replace(/(.)\1+/g, '$1…');
    err(
      primary
        ? `Zeilenfolge „${compact}“ – erwartet K, E, 1–5 × M, 1–1000 × P`
        : `Zeilenfolge „${compact}“ – ${k ? 'Folgecode erwartet K, 1–1000 × P' : 'erste Zeile muss K sein'}`,
      'Kap. 3.4'
    );
  }

  records.forEach((r, li) => {
    const fields = SPECF[r[0] as LineType];
    if (!fields) {
      err(`Unbekannter Zeilentyp „${r[0]}“`, undefined, li + 1);
      return;
    }
    fields.forEach((s, fi) => {
      const v = r[fi + 1];
      if (v === undefined || v === '') {
        if (s.required) err(`${s.name}: Pflichtfeld fehlt`, s.id, li + 1);
        return;
      }
      if (!s.rx.test(v)) {
        const hint = s.id === 'P4' && spec === '1.3' && /^-?50000,00$/.test(v) ? ' – der Text erlaubt ±50.000, die Regex nicht' : '';
        err(`${s.name}: „${v}“ ungültig (${s.hint})${hint}`, s.id, li + 1);
      } else if (s.id === 'P4' && spec === '1.2' && Math.abs(parseMoney(v)) > 5000000)
        warn(`${s.name}: ${v} liegt laut Text außerhalb ±50.000,00 (die Regex lässt es zu)`, s.id, li + 1);
      else if (s.id === 'P4' && spec === '1.3' && !v.includes(','))
        warn(`${s.name}: „${v}“ ohne Nachkommastellen – die Regex lässt es zu, der Text verlangt zwei`, s.id, li + 1);
      else if (s.id === 'K8' && v !== spec) warn(`Code nennt Version ${v}, geprüft wird nach ${spec}`, s.id, li + 1);
    });
    if (r.length > fields.length + 1) {
      // Toleranzprinzip (Abschnitt 1.4): zusätzliche Felder am Zeilenende ignorieren
      warn(`${r.length - fields.length - 1} unbekannte(s) Feld(er) am Zeilenende werden ignoriert`, r[0], li + 1);
    }
  });

  if (k) {
    if (+k[4] > +k[5]) warn('BON_ENDE liegt vor BON_START', 'K6', 1);
    if (k[2] && +k[1] > +k[2]) err('Nummer ist größer als Gesamtanzahl', 'K2', 1);
    if (k[1] === '0') err('Nummerierung beginnt mit 1', 'K2', 1);
  }

  if (primary && k) {
    const ms = records.filter((r) => r[0] === 'M');
    const ps = records.filter((r) => r[0] === 'P');
    const e = records.find((r) => r[0] === 'E');
    const kTotal = parseMoney(k[6] ?? '');
    if (ms.length && kTotal !== sumCol(ms, 2)) warn(`UMS_BRUTTO ${k[6]} ≠ Summe der M-Zeilen ${money(sumCol(ms, 2))}`, 'K7', 1);
    if (e && ms.length) {
      if (parseMoney(e[1]) !== sumCol(ms, 3)) warn(`UMS_NETTO ${e[1]} ≠ Summe M4 ${money(sumCol(ms, 3))}`, 'E2');
      if (parseMoney(e[2]) !== sumCol(ms, 4)) warn(`MWST ${e[2]} ≠ Summe M5 ${money(sumCol(ms, 4))}`, 'E3');
      if (parseMoney(e[1]) + parseMoney(e[2]) !== kTotal) warn('UMS_NETTO + MWST ≠ UMS_BRUTTO', 'E2');
    }
    const rates = new Set<string>();
    ms.forEach((m) => {
      if (parseMoney(m[2]) !== parseMoney(m[3]) + parseMoney(m[4])) warn(`Satz ${m[1]} %: Brutto ≠ Netto + MwSt`, 'M3');
      if (rates.has(m[1])) warn(`Steuersatz ${m[1]} % kommt mehrfach vor`, 'M2');
      rates.add(m[1]);
    });
    const single = !k[2] || k[2] === '1';
    if (single && ps.length && ms.length) {
      ps.forEach((p) => {
        if (![...rates].some((r) => parseFloat(r.replace(',', '.')) === parseFloat(p[1].replace(',', '.'))))
          warn(`Position mit ${p[1]} % hat keine passende M-Zeile`, 'P2');
      });
      const pSum = sumCol(ps, 3);
      if (pSum !== sumCol(ms, 2)) warn(`Summe der Positionen ${money(pSum)} ≠ Summe der M-Zeilen ${money(sumCol(ms, 2))}`, 'P4');
    }
  }

  return { findings, records, bytes, chars: text.length, primary, spec };
}

export interface SetCheck {
  findings: Finding[];
  /** Gefundene Nummern (K2) */
  present: number[];
  /** Erwartete Gesamtanzahl (K3) */
  expected: number;
  complete: boolean;
}

/** Prüft mehrere Codes eines Bons (Kapitel 5) auf Zusammengehörigkeit und Vollständigkeit. */
export function validateSet(texts: string[]): SetCheck {
  const findings: Finding[] = [];
  const parsed = texts.map(parseContent);
  const heads = parsed.map((r) => (r[0]?.[0] === 'K' ? r[0] : undefined));
  const present = heads.map((h) => (h ? +h[1] : NaN)).filter((n) => Number.isFinite(n));
  const primary = heads.find((h) => h?.[1] === '1');
  const expected = Math.max(1, ...heads.map((h) => (h?.[2] ? +h[2] : 1)));

  const key = (h: string[]) => [h[3], h[4], h[5], h[6]].join('|');
  const keys = new Set(heads.filter(Boolean).map((h) => key(h!)));
  if (keys.size > 1) findings.push({ severity: 'error', ref: 'K4–K7', message: 'Codes gehören zu unterschiedlichen Bons (BON_NR, Zeit oder Summe weichen ab)' });

  const counts = new Set(heads.filter(Boolean).map((h) => h![2] || '1'));
  if (counts.size > 1) findings.push({ severity: 'error', ref: 'K3', message: `Gesamtanzahl uneinheitlich: ${[...counts].join(', ')}` });
  if (expected > 1 && heads.some((h) => h && !h[2]))
    findings.push({ severity: 'warning', ref: 'K3', message: 'Bei mehreren Codes sollte die Gesamtanzahl in jedem Code stehen' });

  const dupes = present.filter((n, i) => present.indexOf(n) !== i);
  if (dupes.length) findings.push({ severity: 'warning', ref: 'K2', message: `Code ${[...new Set(dupes)].join(', ')} doppelt gescannt` });
  const missing: number[] = [];
  for (let i = 1; i <= expected; i++) if (!present.includes(i)) missing.push(i);
  if (missing.length) findings.push({ severity: 'error', ref: 'K2', message: `Es fehlen Code ${missing.join(', ')} von ${expected}` });
  if (!primary) findings.push({ severity: 'error', ref: 'K2', message: 'Primärcode (Nummer 1) fehlt' });

  const complete = !missing.length && !!primary && keys.size <= 1;
  if (complete && expected > 1) {
    const all = parsed.flat();
    const ms = all.filter((r) => r[0] === 'M');
    const ps = all.filter((r) => r[0] === 'P');
    const pSum = sumCol(ps, 3);
    if (pSum !== sumCol(ms, 2))
      findings.push({ severity: 'warning', ref: 'P4', message: `Summe aller Positionen ${money(pSum)} ≠ Summe der M-Zeilen ${money(sumCol(ms, 2))}` });
  }
  return { findings, present: [...new Set(present)].sort((a, b) => a - b), expected, complete };
}
