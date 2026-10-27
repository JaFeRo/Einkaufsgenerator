import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { SPECS, SPEC_VERSIONS } from '../dakz';
import { About } from './About';
import { Checker } from './Checker';
import { Generator } from './Generator';
import { initialState, persistable, reducer } from './state';
import { KEYS, saveJson } from './storage';
import { takeBonNr, useBonCounter } from './useBonCounter';
import { useSavedBons } from './useSavedBons';

type View = 'generator' | 'checker' | 'about';
const VIEWS: { id: View; label: string }[] = [
  { id: 'generator', label: 'Bons erzeugen' },
  { id: 'checker', label: 'Rückprüfung' },
  { id: 'about', label: 'Spezifikation' }
];

/** Testkanal: wird beim Bauen der Testversion gesetzt (VITE_CHANNEL=test). */
const IS_TEST = import.meta.env.VITE_CHANNEL === 'test';

const viewFromHash = (): View => (window.location.hash === '#pruefen' ? 'checker' : window.location.hash === '#info' ? 'about' : 'generator');

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => initialState(takeBonNr));
  const counter = useBonCounter();
  const saved = useSavedBons();
  const [view, setView] = useState<View>(viewFromHash);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  // Aktuellen Bon merken, damit er nach dem Neuladen erhalten bleibt.
  useEffect(() => {
    saveJson(KEYS.current, persistable(state));
  }, [state]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const select = (v: View) => {
    setView(v);
    const hash = v === 'checker' ? '#pruefen' : v === 'about' ? '#info' : '';
    window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
  };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>dAKZ Bonsimulator</h1>
          {IS_TEST && <span className="test-badge">Testversion</span>}
          <span className="tag">
            QR-Spezifikation {state.spec} · {SPECS[state.spec].charsetLabel} · Testdaten
          </span>
        </div>
        <div className="spec-switch" role="radiogroup" aria-label="Fassung der Spezifikation">
          <span>Spezifikation</span>
          {SPEC_VERSIONS.map((v) => (
            <button
              key={v}
              role="radio"
              aria-checked={state.spec === v}
              title={`Fassung ${v} vom ${SPECS[v].date} (${SPECS[v].status})`}
              onClick={() => {
                dispatch({ type: 'spec', value: v });
                notify(`Spezifikation ${v}: ${SPECS[v].charsetLabel}${SPECS[v].tse ? ', mit TSE-Feldern' : ', ohne TSE-Felder'}`);
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <nav className="tabs" role="tablist" aria-label="Bereiche">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => select(v.id)}>
              {v.label}
            </button>
          ))}
        </nav>
      </header>
      {view === 'generator' && <Generator state={state} dispatch={dispatch} counter={counter} saved={saved} notify={notify} />}
      {view === 'checker' && <Checker notify={notify} spec={state.spec} />}
      {view === 'about' && <About spec={state.spec} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
