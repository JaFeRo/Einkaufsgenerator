import { DEFAULT_OPTIONS, MERCHANT, deriveExternalRef, newSeed } from '../dakz';
import type { Faults, GenerateOptions, Merchant, Receipt } from '../dakz';
import { buildBon } from './sources';
import { KEYS, loadJson } from './storage';

export type TseMode = 'random' | 'ecdsa';
export type PaperWidth = 58 | 80;

export interface AppState {
  /** Szenario-ID oder „tpl:<id>“ für einen gespeicherten Bon */
  scenarioId: string;
  receipt: Receipt;
  merchant: Merchant;
  options: GenerateOptions;
  /** Negativtest: mit anderer Fehlerkorrektur als Q kodieren */
  eccOverride: 'M' | null;
  tseMode: TseMode;
  paper: PaperWidth;
  /** BON_NR, die diesem Bon gehört (vom Zähler vergeben oder beim Scannen beansprucht) */
  assignedBonNr: string;
}

export function initialState(takeBonNr: () => string): AppState {
  const fromUrl = readHash();
  if (fromUrl) return fromUrl;
  const stored = sanitize(loadJson<unknown>(KEYS.current, null));
  if (stored) return stored;
  const bonNr = takeBonNr();
  return {
    scenarioId: 'random',
    receipt: buildBon('random', [], bonNr, newSeed()).receipt,
    merchant: { ...MERCHANT },
    options: { ...DEFAULT_OPTIONS, faults: {} },
    eccOverride: null,
    tseMode: 'random',
    paper: 80,
    assignedBonNr: bonNr
  };
}

export type Action =
  | { type: 'newBon'; scenarioId: string; receipt: Receipt; merchant?: Merchant; options?: GenerateOptions; eccOverride?: 'M' | null }
  | { type: 'renumber'; bonNr: string; start?: number }
  | { type: 'claim'; bonNr: string }
  | { type: 'receipt'; patch: Partial<Receipt> }
  | { type: 'merchant'; patch: Partial<Merchant> }
  | { type: 'options'; patch: Partial<GenerateOptions> }
  | { type: 'fault'; key: keyof Faults; on: boolean }
  | { type: 'ecc'; value: 'M' | null }
  | { type: 'tseMode'; value: TseMode }
  | { type: 'paper'; value: PaperWidth }
  | { type: 'source'; scenarioId: string };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'newBon':
      return {
        ...state,
        scenarioId: action.scenarioId,
        receipt: action.receipt,
        assignedBonNr: action.receipt.bonNr,
        ...(action.merchant && { merchant: action.merchant }),
        ...(action.options && { options: action.options }),
        ...(action.eccOverride !== undefined && { eccOverride: action.eccOverride })
      };
    case 'renumber':
      return {
        ...state,
        assignedBonNr: action.bonNr,
        receipt: {
          ...state.receipt,
          bonNr: action.bonNr,
          externalRef: deriveExternalRef(state.receipt.externalRef, action.bonNr),
          ...(action.start !== undefined && { start: action.start, end: action.start + (state.receipt.end - state.receipt.start) })
        }
      };
    case 'claim':
      return { ...state, assignedBonNr: action.bonNr };
    case 'receipt':
      return { ...state, receipt: { ...state.receipt, ...action.patch } };
    case 'merchant':
      return { ...state, merchant: { ...state.merchant, ...action.patch } };
    case 'options':
      return { ...state, options: { ...state.options, ...action.patch } };
    case 'fault':
      return { ...state, options: { ...state.options, faults: { ...state.options.faults, [action.key]: action.on } } };
    case 'ecc':
      return { ...state, eccOverride: action.value };
    case 'tseMode':
      return { ...state, tseMode: action.value };
    case 'paper':
      return { ...state, paper: action.value };
    case 'source':
      return { ...state, scenarioId: action.scenarioId };
  }
}

// ---------- Persistenz und Teilen per Link ----------

export function persistable(state: AppState) {
  const { scenarioId, receipt, merchant, options, eccOverride, tseMode, paper, assignedBonNr } = state;
  return { v: 1, scenarioId, receipt, merchant, options, eccOverride, tseMode, paper, assignedBonNr };
}

function sanitize(d: unknown): AppState | null {
  if (typeof d !== 'object' || d === null) return null;
  const x = d as Record<string, any>;
  if (x.v !== 1 || !Array.isArray(x.receipt?.positions) || typeof x.receipt?.bonNr !== 'string') return null;
  return {
    scenarioId: String(x.scenarioId ?? 'random'),
    receipt: x.receipt,
    merchant: { ...MERCHANT, ...x.merchant },
    options: { ...DEFAULT_OPTIONS, ...x.options, faults: { ...x.options?.faults } },
    eccOverride: x.eccOverride === 'M' ? 'M' : null,
    tseMode: x.tseMode === 'ecdsa' ? 'ecdsa' : 'random',
    paper: x.paper === 58 ? 58 : 80,
    assignedBonNr: typeof x.assignedBonNr === 'string' ? x.assignedBonNr : x.receipt.bonNr
  };
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function shareHash(state: AppState): string {
  return '#bon=' + toBase64Url(JSON.stringify(persistable(state)));
}

function readHash(): AppState | null {
  const m = /^#bon=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
  if (!m) return null;
  try {
    const s = sanitize(JSON.parse(fromBase64Url(m[1])));
    // Ein geteilter Bon gehört nicht diesem Browser: Nummer gilt als nicht beansprucht.
    return s && { ...s, assignedBonNr: '' };
  } catch {
    return null;
  }
}
