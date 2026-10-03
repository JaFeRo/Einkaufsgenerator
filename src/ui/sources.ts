import { SCENARIOS, deriveExternalRef, fakeTse, instantiate, prng, type Receipt, type SavedBon } from '../dakz';

export const TEMPLATE_PREFIX = 'tpl:';

export const templateId = (scenarioId: string) => (scenarioId.startsWith(TEMPLATE_PREFIX) ? scenarioId.slice(TEMPLATE_PREFIX.length) : null);

export function sourceLabel(scenarioId: string, bons: SavedBon[]): string {
  const id = templateId(scenarioId);
  if (id) return bons.find((b) => b.id === id)?.name ?? 'Gespeicherter Bon';
  return SCENARIOS.find((s) => s.id === scenarioId)?.label ?? SCENARIOS[0].label;
}

/**
 * Baut einen neuen Bon aus einem Szenario oder einem gespeicherten Bon und setzt die
 * übergebene BON_NR. Zeitpunkt ist „jetzt“ (außer beim Zoll-Beispiel, das seine Zeiten behält).
 */
export function buildBon(scenarioId: string, bons: SavedBon[], bonNr: string, seed: number, now = Date.now()): { receipt: Receipt; template: SavedBon | null } {
  const id = templateId(scenarioId);
  const template = id ? (bons.find((b) => b.id === id) ?? null) : null;
  if (template) return { receipt: instantiate(template, bonNr, now, fakeTse(prng(seed))), template };

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const r = scenario.build(seed);
  const duration = r.end - r.start;
  const start = scenario.id === 'zoll61' ? r.start : Math.floor(now / 1000);
  return { receipt: { ...r, bonNr, start, end: start + duration, externalRef: deriveExternalRef(r.externalRef, bonNr) }, template: null };
}
