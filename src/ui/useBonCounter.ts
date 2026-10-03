import { useCallback, useEffect, useState } from 'react';
import { allocateBonNr, markIssued, type BonCounterState } from '../dakz';
import { KEYS, loadJson, saveJson } from './storage';

const DEFAULT: BonCounterState = { next: 100001, issued: [] };
/** Ältere Einträge fallen heraus, damit der Speicher nicht unbegrenzt wächst. */
const MAX_ISSUED = 20000;

function read(): BonCounterState {
  const s = loadJson<BonCounterState>(KEYS.counter, DEFAULT);
  return { next: typeof s.next === 'number' ? s.next : DEFAULT.next, issued: Array.isArray(s.issued) ? s.issued.map(String) : [] };
}

function write(s: BonCounterState) {
  saveJson(KEYS.counter, { next: s.next, issued: s.issued.slice(-MAX_ISSUED) });
}

/** Vergibt BON_NR synchron aus dem Speicher, damit auch mehrere Tabs keine Nummer doppelt ziehen. */
export function takeBonNr(): string {
  const { bonNr, state } = allocateBonNr(read());
  write(state);
  return bonNr;
}

export function markBonNrIssued(bonNr: string) {
  write(markIssued(read(), bonNr));
}

export interface BonCounter {
  next: number;
  issuedCount: number;
  isIssued: (bonNr: string) => boolean;
  take: () => string;
  markIssued: (bonNr: string) => void;
  setNext: (n: number) => void;
  reset: () => void;
}

export function useBonCounter(): BonCounter {
  const [snap, setSnap] = useState(read);
  const refresh = useCallback(() => setSnap(read()), []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === KEYS.counter && refresh();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const issued = new Set(snap.issued);
  return {
    next: snap.next,
    issuedCount: snap.issued.length,
    isIssued: (n) => issued.has(n),
    take: () => {
      const n = takeBonNr();
      refresh();
      return n;
    },
    markIssued: (n) => {
      markBonNrIssued(n);
      refresh();
    },
    setNext: (n) => {
      write({ ...read(), next: Math.max(1, Math.floor(n)) });
      refresh();
    },
    reset: () => {
      write(DEFAULT);
      refresh();
    }
  };
}
