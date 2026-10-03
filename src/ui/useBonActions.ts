import { useMemo, type Dispatch } from 'react';
import { newSeed, type SavedBon } from '../dakz';
import { buildBon, templateId } from './sources';
import type { Action, AppState } from './state';
import type { BonCounter } from './useBonCounter';

export interface BonActions {
  /** Neuer Bon aus Szenario oder gespeichertem Bon, mit neuer BON_NR vom Zähler */
  newBon: (scenarioId?: string) => void;
  /** Gleicher Einkauf, neue BON_NR und Uhrzeit – für wiederholte Scans */
  renumber: () => void;
  /** Aktuelle BON_NR als verwendet markieren (vor Scan, Druck, Export) */
  claim: () => void;
  /** Die aktuelle Nummer wurde schon von einem anderen Bon verwendet */
  duplicate: boolean;
}

export function useBonActions(state: AppState, dispatch: Dispatch<Action>, counter: BonCounter, bons: SavedBon[], notify: (m: string) => void): BonActions {
  const { receipt, assignedBonNr, scenarioId, options } = state;
  const duplicate = receipt.bonNr !== assignedBonNr && counter.isIssued(receipt.bonNr);

  return useMemo(() => {
    const take = () => {
      try {
        return counter.take();
      } catch (e) {
        notify((e as Error).message);
        return null;
      }
    };
    return {
      duplicate,
      newBon: (id = scenarioId === 'zoll61' ? 'random' : scenarioId) => {
        const bonNr = take();
        if (!bonNr) return;
        const { receipt: r, template } = buildBon(id, bons, bonNr, newSeed());
        dispatch(
          template
            ? { type: 'newBon', scenarioId: id, receipt: r, merchant: { ...template.merchant }, options: { ...template.options, faults: { ...template.options.faults } }, eccOverride: template.eccOverride }
            : templateId(scenarioId)
              ? // Vom eigenen Bon zurück zum Standard-Szenario: dessen eingebaute Fehler nicht übernehmen
                { type: 'newBon', scenarioId: id, receipt: r, options: { ...options, faults: {} }, eccOverride: null }
              : { type: 'newBon', scenarioId: id, receipt: r }
        );
      },
      renumber: () => {
        const bonNr = take();
        if (bonNr) dispatch({ type: 'renumber', bonNr, start: Math.floor(Date.now() / 1000) });
      },
      claim: () => {
        if (receipt.bonNr === assignedBonNr) return;
        counter.markIssued(receipt.bonNr);
        dispatch({ type: 'claim', bonNr: receipt.bonNr });
      }
    };
  }, [duplicate, scenarioId, options, bons, counter, dispatch, notify, receipt.bonNr, assignedBonNr]);
}
