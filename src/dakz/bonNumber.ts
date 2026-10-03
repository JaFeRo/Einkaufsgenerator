import { RX } from './validate';

/** Höchste BON_NR, die die Regex in K4 zulässt (10^12). */
export const MAX_BON_NR = 1_000_000_000_000;

export function isValidBonNr(s: string): boolean {
  return RX.bonNr.test(s);
}

export interface BonCounterState {
  /** Nächste zu vergebende Nummer */
  next: number;
  /** Bereits vergebene Nummern */
  issued: string[];
}

/**
 * Vergibt die nächste freie BON_NR: zählt ab `next` hoch und überspringt Nummern,
 * die schon (z. B. von Hand) verwendet wurden. Liefert die Nummer und den neuen Zustand.
 */
export function allocateBonNr(state: BonCounterState): { bonNr: string; state: BonCounterState } {
  const issued = new Set(state.issued);
  let n = Math.max(1, Math.floor(state.next));
  while (issued.has(String(n))) n++;
  if (n > MAX_BON_NR) throw new RangeError('Bonnummern erschöpft – Zähler bitte zurücksetzen');
  const bonNr = String(n);
  return { bonNr, state: { next: n + 1, issued: [...state.issued, bonNr] } };
}

/** Markiert eine Nummer als verwendet, ohne den Zähler zu verändern. */
export function markIssued(state: BonCounterState, bonNr: string): BonCounterState {
  return state.issued.includes(bonNr) ? state : { ...state, issued: [...state.issued, bonNr] };
}
