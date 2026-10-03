import { useEffect, useRef, useState, type Dispatch } from 'react';
import { signTse } from '../dakz';
import { Editor } from './Editor';
import { Inspector } from './Inspector';
import { Receipt } from './Receipt';
import { ScanOverlay } from './ScanOverlay';
import { sourceLabel } from './sources';
import type { Action, AppState } from './state';
import { useBonActions } from './useBonActions';
import type { BonCounter } from './useBonCounter';
import { useCodes } from './useCodes';
import type { SavedBonsApi } from './useSavedBons';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  counter: BonCounter;
  saved: SavedBonsApi;
  notify: (m: string) => void;
}

export function Generator({ state, dispatch, counter, saved, notify }: Props) {
  const bon = useCodes(state);
  const actions = useBonActions(state, dispatch, counter, saved.bons, notify);
  const [scan, setScan] = useState(false);
  const { receipt, tseMode } = state;

  // Echte Signatur nachziehen, sobald sich signierte Daten ändern.
  const signedFor = useRef('');
  useEffect(() => {
    if (tseMode !== 'ecdsa') {
      signedFor.current = '';
      return;
    }
    const key = JSON.stringify([receipt.bonNr, receipt.start, receipt.end, receipt.positions]);
    if (signedFor.current === key) return;
    let cancelled = false;
    signTse(receipt).then((t) => {
      if (cancelled) return;
      signedFor.current = key;
      dispatch({ type: 'receipt', patch: { tseSignature: t.signature, tsePublicKey: t.publicKey } });
    });
    return () => {
      cancelled = true;
    };
  }, [tseMode, receipt, dispatch]);

  useEffect(() => {
    document.documentElement.style.setProperty('--paper-width', `${state.paper}mm`);
  }, [state.paper]);

  // Was im Scanmodus gezeigt wird, gilt als verwendet.
  useEffect(() => {
    if (scan) actions.claim();
  }, [scan, actions]);

  return (
    <main className="bench">
      <Editor state={state} dispatch={dispatch} counter={counter} actions={actions} saved={saved} notify={notify} />
      <section className="stage" aria-label="Kassenbon">
        <div className="stage-actions no-print">
          <button className="btn primary" onClick={() => actions.newBon()} title="Neuer Einkauf im gewählten Szenario, neue Bon-Nr.">
            Nächster Bon
          </button>
          <button className="btn" onClick={actions.renumber} title="Gleiche Positionen, nächste Bon-Nr. vom Zähler, aktuelle Uhrzeit">
            Gleicher Einkauf, neue Nr.
          </button>
          <button className="btn" onClick={() => setScan(true)}>
            Scanmodus
          </button>
        </div>
        <p className="hint no-print" style={{ textAlign: 'center' }}>
          Quelle: {sourceLabel(state.scenarioId, saved.bons)} · Bon-Nr. <b className="mono">{receipt.bonNr}</b>
          {actions.duplicate && <span style={{ color: 'var(--err)' }}> · bereits verwendet</span>}
        </p>
        <Receipt receipt={receipt} merchant={state.merchant} bon={bon} paper={state.paper} />
      </section>
      <Inspector state={state} dispatch={dispatch} bon={bon} notify={notify} counter={counter} actions={actions} saved={saved} />
      {scan && (
        <ScanOverlay bon={bon} bonNr={receipt.bonNr} duplicate={actions.duplicate} onClose={() => setScan(false)} onNextBon={() => actions.newBon()} onRenumber={actions.renumber} />
      )}
    </main>
  );
}
