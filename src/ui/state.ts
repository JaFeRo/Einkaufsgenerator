import { DEFAULT_OPTIONS, MERCHANT, SCENARIOS, newSeed } from '../dakz';
import type { Faults, GenerateOptions, Merchant, Receipt } from '../dakz';

export type TseMode = 'random' | 'ecdsa';
export type PaperWidth = 58 | 80;

export interface AppState {
  scenarioId: string;
  receipt: Receipt;
  merchant: Merchant;
  options: GenerateOptions;
  /** Negativtest: mit anderer Fehlerkorrektur als Q kodieren */
  eccOverride: 'M' | null;
  tseMode: TseMode;
  paper: PaperWidth;
}

export function initialState(): AppState {
  const fromUrl = readHash();
  if (fromUrl) return fromUrl;
  return {
    scenarioId: 'random',
    receipt: SCENARIOS[0].build(newSeed()),
    merchant: { ...MERCHANT },
    options: { ...DEFAULT_OPTIONS, faults: {} },
    eccOverride: null,
    tseMode: 'random',
    paper: 80
  };
}

export type Action =
  | { type: 'scenario'; id: string; seed?: number }
  | { type: 'receipt'; patch: Partial<Receipt> }
  | { type: 'merchant'; patch: Partial<Merchant> }
  | { type: 'options'; patch: Partial<GenerateOptions> }
  | { type: 'fault'; key: keyof Faults; on: boolean }
  | { type: 'ecc'; value: 'M' | null }
  | { type: 'tseMode'; value: TseMode }
  | { type: 'paper'; value: PaperWidth }
  | { type: 'load'; state: AppState };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'scenario': {
      const s = SCENARIOS.find((x) => x.id === action.id) ?? SCENARIOS[0];
      return { ...state, scenarioId: s.id, receipt: s.build(action.seed ?? newSeed()) };
    }
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
    case 'load':
      return action.state;
  }
}

// ---------- Teilen per Link: Zustand als Base64url im Hash ----------

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
  const { scenarioId, receipt, merchant, options, eccOverride, tseMode, paper } = state;
  return '#bon=' + toBase64Url(JSON.stringify({ v: 1, scenarioId, receipt, merchant, options, eccOverride, tseMode, paper }));
}

function readHash(): AppState | null {
  const m = /^#bon=([A-Za-z0-9_-]+)$/.exec(window.location.hash);
  if (!m) return null;
  try {
    const d = JSON.parse(fromBase64Url(m[1]));
    if (d.v !== 1 || !Array.isArray(d.receipt?.positions)) return null;
    return {
      scenarioId: String(d.scenarioId ?? 'random'),
      receipt: d.receipt,
      merchant: { ...MERCHANT, ...d.merchant },
      options: { ...DEFAULT_OPTIONS, ...d.options, faults: { ...d.options?.faults } },
      eccOverride: d.eccOverride === 'M' ? 'M' : null,
      tseMode: d.tseMode === 'ecdsa' ? 'ecdsa' : 'random',
      paper: d.paper === 58 ? 58 : 80
    };
  } catch {
    return null;
  }
}
