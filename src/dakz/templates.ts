import type { Faults, GenerateOptions, Merchant, Position, Receipt } from './types';

/** Ein vom Nutzer gespeicherter Bon (Testfall). BON_NR, Zeit und TSE werden beim Laden neu gesetzt. */
export interface SavedBon {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  positions: Position[];
  merchant: Merchant;
  options: GenerateOptions;
  eccOverride: 'M' | null;
  /** BON_ENDE − BON_START in Sekunden */
  durationSec: number;
  /** Feste externe Referenz; leer = „REF_<BON_NR>“ */
  externalRef: string;
}

export const TEMPLATE_FILE_KIND = 'dakz-bonsimulator/bons';

/** Referenzen der Form REF_<Bonnummer> folgen der neuen Nummer. */
export function deriveExternalRef(ref: string, bonNr: string): string {
  return ref === '' || /^REF_\d+$/.test(ref) ? `REF_${bonNr}` : ref;
}

export function instantiate(t: SavedBon, bonNr: string, now: number, tse: { signature: string; publicKey: string }): Receipt {
  const start = Math.floor(now / 1000);
  return {
    bonNr,
    start,
    end: start + Math.max(0, t.durationSec),
    tseSignature: tse.signature,
    tsePublicKey: tse.publicKey,
    externalRef: deriveExternalRef(t.externalRef, bonNr),
    positions: t.positions.map((p) => ({ ...p }))
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

function sanitizePosition(v: unknown): Position | null {
  if (!isObj(v) || typeof v.text !== 'string') return null;
  return {
    text: v.text,
    qty: num(v.qty, 1),
    unit: str(v.unit, 'Stück'),
    unitPrice: num(v.unitPrice, 0),
    vat: num(v.vat, 19),
    refundable: v.refundable !== false
  };
}

/** Liest gespeicherte Bons aus einer JSON-Datei oder dem Browser-Speicher und verwirft Ungültiges. */
export function parseSavedBons(raw: unknown, defaults: { merchant: Merchant; options: GenerateOptions }): SavedBon[] {
  const list = isObj(raw) && Array.isArray(raw.bons) ? raw.bons : Array.isArray(raw) ? raw : [];
  const out: SavedBon[] = [];
  for (const v of list) {
    if (!isObj(v) || typeof v.name !== 'string' || !Array.isArray(v.positions)) continue;
    const positions = v.positions.map(sanitizePosition).filter((p): p is Position => p !== null);
    const m = isObj(v.merchant) ? v.merchant : {};
    const o = isObj(v.options) ? v.options : {};
    out.push({
      id: str(v.id) || crypto.randomUUID(),
      name: v.name.slice(0, 80),
      createdAt: str(v.createdAt, new Date().toISOString()),
      updatedAt: str(v.updatedAt, new Date().toISOString()),
      positions,
      merchant: { ...defaults.merchant, ...Object.fromEntries(Object.entries(m).filter(([, x]) => typeof x === 'string')) },
      options: {
        ...defaults.options,
        rateStyle: o.rateStyle === 'fixed' ? 'fixed' : 'plain',
        trailingLF: o.trailingLF !== false,
        alwaysWriteTotal: o.alwaysWriteTotal === true,
        limitBytes: Math.min(defaults.options.limitBytes, Math.max(200, num(o.limitBytes, defaults.options.limitBytes))),
        faults: isObj(o.faults) ? (Object.fromEntries(Object.entries(o.faults).filter(([, x]) => x === true)) as Faults) : {}
      },
      eccOverride: v.eccOverride === 'M' ? 'M' : null,
      durationSec: Math.max(0, num(v.durationSec, 12)),
      externalRef: str(v.externalRef)
    });
  }
  return out;
}
