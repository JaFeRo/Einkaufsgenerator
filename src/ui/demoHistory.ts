import { useSyncExternalStore } from 'react';
import { computeTotals, demoMerchant, sanitizeReceipt, type Receipt, type SpecVersion } from '../dakz';
import { MONOPOLY_CENTS } from './demoState';
import { KEYS, loadJson, saveJson } from './storage';

/**
 * Verlauf der Ausfuhrkassenzettel aus der Demo, nur im Browser gespeichert.
 * Ein Bon ist entweder offen oder als Ganzes entwertet (keine Teilentwertung).
 */
export interface HistoryEntry {
  /** BON_NR und BON_START: eindeutig, auch nach einem Zurücksetzen des Zählers */
  id: string;
  merchantId: string;
  merchantName: string;
  spec: SpecVersion;
  /** Mit Monopoly-Preisen (auf 10 € gerundet) erstellt */
  monopoly: boolean;
  /** Zeitpunkt des Abschlusses (ms) */
  createdAt: number;
  receipt: Receipt;
  /** Zeitpunkt der Entwertung (ms), null = offen. Entwertet wird immer der ganze Bon. */
  voidedAt: number | null;
  /**
   * Bei der Entwertung als ausgeführt markierte Positionen (Index in receipt.positions);
   * null = alle Waren ausgeführt. Nur diese Positionen zählen für die Erstattung.
   */
  exported: number[] | null;
  note: string;
}

export const entryId = (r: Receipt) => `${r.bonNr}-${r.start}`;

/**
 * MwSt. der erstattungsfähigen Positionen in Cent, je Steuersatz gerechnet wie auf dem Bon.
 * Mit `exported` nur die ausgeführten Positionen (Teilausfuhr).
 */
export const refundCents = (r: Receipt, exported: number[] | null = null): number =>
  computeTotals(r.positions.filter((p, i) => p.refundable && (exported === null || exported.includes(i)))).vat;

/** MwSt.-Anteil einer einzelnen Position in Cent (nur zur Anzeige; die Summe rechnet je Steuersatz) */
export const positionVatCents = (gross: number, rate: number): number => Math.round((gross * rate) / (100 + rate));

/** Erstattung eines Eintrags: nach der Entwertung für die ausgeführten Positionen, vorher für alle */
export const entryRefundCents = (e: HistoryEntry): number => refundCents(e.receipt, e.voidedAt ? e.exported : null);

/** Wurden bei der Entwertung nicht alle erstattungsfähigen Positionen ausgeführt? */
export const isPartial = (e: HistoryEntry): boolean =>
  !!e.voidedAt && e.exported !== null && e.receipt.positions.some((p, i) => p.refundable && !e.exported!.includes(i));

/** Auszahlung in Monopoly-Scheinen (1 Schein = 10 €): kaufmännisch gerundet, bei jeder Erstattung mindestens ein Schein */
export const refundNotes = (cents: number): number => (cents > 0 ? Math.max(1, Math.round(cents / MONOPOLY_CENTS)) : 0);

function sanitizeEntry(v: unknown): HistoryEntry | null {
  if (typeof v !== 'object' || v === null) return null;
  const x = v as Record<string, unknown>;
  const receipt = sanitizeReceipt(x.receipt);
  if (!receipt) return null;
  const merchantId = typeof x.merchantId === 'string' ? x.merchantId : '';
  return {
    id: entryId(receipt),
    merchantId,
    merchantName: typeof x.merchantName === 'string' ? x.merchantName : (demoMerchant(merchantId)?.name ?? 'Unbekannter Händler'),
    spec: x.spec === '1.2' ? '1.2' : '1.3',
    monopoly: x.monopoly === true,
    createdAt: typeof x.createdAt === 'number' ? x.createdAt : receipt.end * 1000,
    receipt,
    voidedAt: typeof x.voidedAt === 'number' ? x.voidedAt : null,
    exported:
      typeof x.voidedAt === 'number' && Array.isArray(x.exported)
        ? [...new Set(x.exported.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < receipt.positions.length))].sort((a, b) => a - b)
        : null,
    note: typeof x.note === 'string' ? x.note.slice(0, 500) : ''
  };
}

/** Liest eine Liste (Speicher oder exportierte Datei); Ungültiges fällt heraus, doppelte IDs nur einmal. */
export function parseHistory(raw: unknown): HistoryEntry[] {
  const list = Array.isArray(raw) ? raw : typeof raw === 'object' && raw !== null && Array.isArray((raw as { entries?: unknown }).entries) ? (raw as { entries: unknown[] }).entries : [];
  const seen = new Map<string, HistoryEntry>();
  for (const v of list) {
    const e = sanitizeEntry(v);
    if (e && !seen.has(e.id)) seen.set(e.id, e);
  }
  return [...seen.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/** Zusammenführen beim Import: bekannte Einträge bleiben, eine Entwertung aus der Datei wird übernommen. */
export function mergeHistory(current: HistoryEntry[], incoming: HistoryEntry[]): { entries: HistoryEntry[]; added: number; updated: number } {
  const map = new Map(current.map((e) => [e.id, e]));
  let added = 0;
  let updated = 0;
  for (const e of incoming) {
    const have = map.get(e.id);
    if (!have) {
      map.set(e.id, e);
      added++;
    } else if (e.voidedAt && !have.voidedAt) {
      map.set(e.id, { ...have, voidedAt: e.voidedAt, exported: e.exported, note: have.note || e.note });
      updated++;
    }
  }
  return { entries: [...map.values()].sort((a, b) => a.createdAt - b.createdAt), added, updated };
}

// ---------- Speicher ----------

let entries: HistoryEntry[] = parseHistory(loadJson<unknown>(KEYS.demoHistory, []));
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Speichert; false, wenn der Browser-Speicher voll ist (der Stand im Fenster bleibt dann trotzdem erhalten). */
function commit(next: HistoryEntry[]): boolean {
  entries = next;
  emit();
  return saveJson(KEYS.demoHistory, { v: 1, entries });
}

// Andere Tabs halten den Verlauf aktuell
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key !== KEYS.demoHistory) return;
    entries = parseHistory(loadJson<unknown>(KEYS.demoHistory, []));
    emit();
  });

export const historyApi = {
  /** Neuer Eintrag nach „Bon abschließen“; ein schon bekannter Bon wird nicht doppelt erfasst. */
  record(e: Omit<HistoryEntry, 'id' | 'voidedAt' | 'exported' | 'note'>): boolean {
    const id = entryId(e.receipt);
    if (entries.some((x) => x.id === id)) return true;
    return commit([...entries, { ...e, id, voidedAt: null, exported: null, note: '' }]);
  },
  /** Ganzen Bon entwerten; `exported` = ausgeführte Positionen, null = alle */
  void(id: string, exported: number[] | null, now = Date.now()): boolean {
    return commit(entries.map((e) => (e.id === id ? { ...e, voidedAt: now, exported: exported ? [...exported].sort((a, b) => a - b) : null } : e)));
  },
  unvoid(id: string): boolean {
    return commit(entries.map((e) => (e.id === id ? { ...e, voidedAt: null, exported: null } : e)));
  },
  setNote(id: string, note: string): boolean {
    return commit(entries.map((e) => (e.id === id ? { ...e, note: note.slice(0, 500) } : e)));
  },
  remove(id: string): boolean {
    return commit(entries.filter((e) => e.id !== id));
  },
  clear(): boolean {
    return commit([]);
  },
  import(incoming: HistoryEntry[]) {
    const r = mergeHistory(entries, incoming);
    return { ...r, saved: commit(r.entries) };
  },
  exportJson(): string {
    return JSON.stringify({ format: 'dakz-demo-historie', v: 1, exportedAt: new Date().toISOString(), entries }, null, 1);
  }
};

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entries
  );
}
