import type { RateStyle } from './types';

/** Cent-Betrag → „1234,56“ (Dezimalkomma, keine Tausendertrennung). */
export function money(cents: number): string {
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${s}` : s;
}

/** „1234,56“ → Cent. Liefert NaN bei ungültiger Eingabe. */
export function parseMoney(s: string): number {
  if (!/^-?\d+(,\d{1,2})?$/.test(s)) return NaN;
  return Math.round(parseFloat(s.replace(',', '.')) * 100);
}

/** 19 → „19“ oder „19,00“. */
export function formatRate(rate: number, style: RateStyle): string {
  if (style === 'fixed') return rate.toFixed(2).replace('.', ',');
  return String(Math.round(rate * 100) / 100).replace('.', ',');
}

/** Menge mit höchstens drei Nachkommastellen. */
export function formatQty(qty: number): string {
  return String(Math.round(qty * 1000) / 1000).replace('.', ',');
}

/** Deutsche Zahleneingabe („1,5“ oder „1.5“) → Zahl. */
export function parseDecimal(s: string): number {
  const n = parseFloat(String(s).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** CSV-Feld nach C5/C7 maskieren. */
export function csvField(value: string | number): string {
  const v = String(value);
  return /[;"]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Euro-Anzeige für die Oberfläche, z. B. „1.234,56 €“. */
export function euro(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Unix-Sekunden → „04.02.2026 11:45:44“ in UTC oder lokal. */
export function formatEpoch(epoch: number, utc: boolean): string {
  const d = new Date(epoch * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const [day, month, year, h, m, s] = utc
    ? [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]
    : [d.getDate(), d.getMonth() + 1, d.getFullYear(), d.getHours(), d.getMinutes(), d.getSeconds()];
  return `${p(day)}.${p(month)}.${year} ${p(h)}:${p(m)}:${p(s)}`;
}
