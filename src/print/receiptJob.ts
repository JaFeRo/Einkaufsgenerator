/**
 * Druckauftrag für einen Bon: derselbe Inhalt wie die Bildschirmansicht, als Text in Schrift A,
 * die QR-Codes als Rasterbild mit der gewählten Modulgröße oder als Druckerbefehl.
 */
import { SPECS, encodeText as encodeCharset, formatEpoch, formatQty, money, positionGross, vatLetter, type Merchant, type Receipt } from '../dakz';
import { encodeQr } from '../qr/encode';
import type { RenderedBon } from '../ui/useCodes';
import { EscPos, columnsFor, rasterDots, type CodePage } from './escpos';

export type QrMode = 'raster' | 'native';

export interface PrintSettings {
  /** Druckbreite in Punkten: 576 bei 80 mm, 512 bei manchen 80-mm-Geräten, 384 bei 58 mm */
  widthDots: number;
  codePage: CodePage;
  qrMode: QrMode;
  /** Am Ende schneiden (GS V); Geräte ohne Schneidwerk ignorieren den Befehl */
  cut: boolean;
}

export const DEFAULT_PRINT: PrintSettings = { widthDots: 576, codePage: 'pc850', qrMode: 'raster', cut: true };

/** Links Text, rechts Betrag; zu lange Texte brechen um, der Betrag steht in der letzten Zeile. */
export function twoColumns(left: string, right: string, cols: number): string[] {
  const room = cols - right.length - 1;
  const words = left.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= room) cur = next;
    else {
      if (cur) lines.push(cur);
      // Ein einzelnes zu langes Wort hart trennen
      let rest = w;
      while (rest.length > room) {
        lines.push(rest.slice(0, room));
        rest = rest.slice(room);
      }
      cur = rest;
    }
  }
  lines.push(cur.padEnd(room) + ' ' + right);
  return lines;
}

/** Freien Text auf Zeilenbreite umbrechen. */
export function wrap(text: string, cols: number): string[] {
  return twoColumns(text, '', cols + 1).map((l) => l.trimEnd());
}

interface Job {
  receipt: Receipt;
  merchant: Merchant;
  bon: RenderedBon;
  moduleDots: number;
  settings: PrintSettings;
  /** Slogan und Fußzeilen der Demo-Händler */
  slogan?: string;
  footer?: string[];
}

export function receiptJob({ receipt, merchant, bon, moduleDots, settings, slogan, footer }: Job): Uint8Array {
  const { widthDots, codePage } = settings;
  const cols = columnsFor(widthDots);
  const p = new EscPos(codePage).init();
  const rule = () => p.line('-'.repeat(cols));
  const stars = () => p.line('*'.repeat(cols));
  const pair = (l: string, r: string) => twoColumns(l, r, cols).forEach((x) => p.line(x));
  const para = (t: string) => wrap(t, cols).forEach((x) => p.line(x));

  p.align('center').bold(true).line('*** TESTBELEG ***').bold(false);
  p.bold(true).size(false, true);
  para(merchant.name);
  p.size(false, false).bold(false);
  para(merchant.address);
  p.line(`USt-IdNr. ${merchant.vatId}`);
  if (slogan) para(slogan);
  p.align('left');
  rule();
  for (const pos of receipt.positions) {
    pair(pos.text, `${money(positionGross(pos))} ${vatLetter(pos.vat)}`);
    if (pos.qty !== 1 || pos.unit !== 'Stück') wrap(`${formatQty(pos.qty)} ${pos.unit} × ${money(Math.round(pos.unitPrice * 100))}`, cols - 2).forEach((x) => p.line(`  ${x}`));
    if (!pos.refundable) p.line('  nicht erstattungsfähig');
  }
  rule();
  const t = bon.totals;
  p.bold(true).size(false, true);
  pair('SUMME EUR', money(t.gross));
  p.size(false, false).bold(false);
  pair('Karte: VISA', money(t.gross));
  stars();
  for (const l of t.vatLines) pair(`${vatLetter(l.rate)} ${String(l.rate).replace('.', ',')} % Netto ${money(l.net)}`, money(l.vat));
  pair('Nettoumsatz', money(t.net));
  stars();
  pair(`Bon ${receipt.bonNr}`, merchant.register);
  p.line(formatEpoch(receipt.start, false));
  rule();
  p.line('TSE (Zeiten in UTC)');
  pair('Start', formatEpoch(receipt.start, true));
  pair('Ende', formatEpoch(receipt.end, true));
  p.line('TSE-Signatur:');
  for (let i = 0; i < receipt.tseSignature.length; i += cols) p.line(receipt.tseSignature.slice(i, i + cols));
  rule();
  p.align('center').bold(true).line('Digitaler Ausfuhrkassenzettel').bold(false);
  para(`Einkaufsdaten für dAKZ – mit der ${SPECS[bon.spec].appName} scannen`);
  p.line();
  for (const c of bon.codes) {
    if (!c.matrix) {
      para(`QR ${c.index}/${c.count}: ${c.qrError ?? 'nicht erzeugbar'}`);
      continue;
    }
    if (settings.qrMode === 'native') p.qrNative(c.data, moduleDots, bon.ecc);
    else {
      const dots = rasterDots(c.matrix, moduleDots, widthDots);
      if (dots < 1) para(`QR ${c.index}/${c.count} ist zu groß für die Druckbreite`);
      else p.qrRaster(c.matrix, dots, widthDots);
    }
    if (c.count > 1) p.line(`QR ${c.index}/${c.count}`);
    p.line();
  }
  if (footer?.length) {
    rule();
    footer.forEach(para);
  }
  rule();
  para('Simulation · kein steuerlich gültiger Beleg');
  p.bold(true).line('*** TESTBELEG ***').bold(false);
  p.align('left').feed(4);
  if (settings.cut) p.cut();
  return p.build();
}

/** Testseite: Einstellungen, Zeichentabelle, ein großer und ein dAKZ-typischer QR-Code. */
export function testJob(settings: PrintSettings, moduleDots: number): Uint8Array {
  const cols = columnsFor(settings.widthDots);
  const p = new EscPos(settings.codePage).init();
  const para = (t: string) => wrap(t, cols).forEach((x) => p.line(x));
  p.align('center').bold(true).size(true, true).line('Testdruck').size(false, false).bold(false);
  p.line('dAKZ Bonsimulator');
  p.align('left').line('-'.repeat(cols));
  para(`Druckbreite: ${settings.widthDots} Punkte, ${cols} Zeichen`);
  para(`Zeichentabelle: ${settings.codePage}`);
  para(`QR-Druck: ${settings.qrMode === 'raster' ? 'Rasterbild' : 'Druckerbefehl'}, ${moduleDots} Punkte je Modul`);
  p.line('Umlaute: äöü ÄÖÜ ß');
  p.line('Zeichen: € × · „“');
  p.line('1234567890'.repeat(Math.ceil(cols / 10)).slice(0, cols));
  p.line('-'.repeat(cols));
  p.align('center').line('QR „TEST“ (Funktionstest)');
  const test = encodeQr('TEST', 'M');
  if (settings.qrMode === 'native') p.qrNative(encodeCharset('TEST', 'iso-8859-1'), 8, 'M');
  else p.qrRaster(test, rasterDots(test, 8, settings.widthDots), settings.widthDots);
  p.line();
  para(`QR mit „Stück“ in ISO 8859-1, ${moduleDots} Punkte je Modul`);
  const text = 'K;1;;1;1794500000;1794500001;105,20\nP;19;1;105,20;1;Stück;Test\n';
  const m = encodeQr(text, 'Q', 'iso-8859-1');
  if (settings.qrMode === 'native') p.qrNative(encodeCharset(text, 'iso-8859-1'), moduleDots, 'Q');
  else p.qrRaster(m, rasterDots(m, moduleDots, settings.widthDots), settings.widthDots);
  p.line().line('*** TESTBELEG ***').align('left').feed(4);
  if (settings.cut) p.cut();
  return p.build();
}
