import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import { signTse } from '../dakz';
import { Editor } from './Editor';
import { Inspector } from './Inspector';
import { Receipt } from './Receipt';
import { ScanOverlay } from './ScanOverlay';
import type { Action, AppState } from './state';
import { useCodes } from './useCodes';

export function Generator({ state, dispatch, notify }: { state: AppState; dispatch: Dispatch<Action>; notify: (m: string) => void }) {
  const bon = useCodes(state);
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

  const nextBon = useCallback(() => dispatch({ type: 'scenario', id: state.scenarioId === 'zoll61' ? 'random' : state.scenarioId }), [dispatch, state.scenarioId]);

  return (
    <main className="bench">
      <Editor state={state} dispatch={dispatch} />
      <section className="stage" aria-label="Kassenbon">
        <div className="stage-actions no-print">
          <button className="btn primary" onClick={nextBon} title="Neuer Bon im gewählten Szenario">
            Nächster Bon
          </button>
          <button className="btn" onClick={() => setScan(true)}>
            Scanmodus
          </button>
        </div>
        <Receipt receipt={receipt} merchant={state.merchant} bon={bon} paper={state.paper} />
      </section>
      <Inspector state={state} dispatch={dispatch} bon={bon} notify={notify} />
      {scan && <ScanOverlay bon={bon} bonNr={receipt.bonNr} onClose={() => setScan(false)} onNextBon={nextBon} />}
    </main>
  );
}
