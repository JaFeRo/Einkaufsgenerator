import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { About } from './About';
import { Checker } from './Checker';
import { Generator } from './Generator';
import { initialState, reducer } from './state';

type View = 'generator' | 'checker' | 'about';
const VIEWS: { id: View; label: string }[] = [
  { id: 'generator', label: 'Bons erzeugen' },
  { id: 'checker', label: 'Rückprüfung' },
  { id: 'about', label: 'Spezifikation' }
];

const viewFromHash = (): View => (window.location.hash === '#pruefen' ? 'checker' : window.location.hash === '#info' ? 'about' : 'generator');

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [view, setView] = useState<View>(viewFromHash);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number>(undefined);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

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
          <span className="tag">QR-Spezifikation v1.2 · Testdaten</span>
        </div>
        <nav className="tabs" role="tablist" aria-label="Bereiche">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} onClick={() => select(v.id)}>
              {v.label}
            </button>
          ))}
        </nav>
      </header>
      {view === 'generator' && <Generator state={state} dispatch={dispatch} notify={notify} />}
      {view === 'checker' && <Checker notify={notify} />}
      {view === 'about' && <About />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
