import { Component, type ReactNode } from 'react';
import { KEYS } from './storage';

/** Fängt Abstürze beim Darstellen ab, damit statt einer leeren Seite ein Ausweg angezeigt wird. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private reload = (keys: string[]) => {
    try {
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* Speicher gesperrt – Neuladen versuchen wir trotzdem */
    }
    window.location.replace(window.location.pathname + window.location.search);
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="about" role="alert" style={{ paddingTop: 48 }}>
        <section className="panel" style={{ padding: '22px 26px' }}>
          <h2>Die Anwendung ist abgestürzt</h2>
          <p>Vermutlich liegt im Browser ein beschädigter oder veralteter Speicherstand. Deine gespeicherten Bons bleiben bei der ersten Option erhalten.</p>
          <div className="row">
            <button className="btn primary" onClick={() => this.reload([KEYS.current])}>
              Aktuellen Bon verwerfen und neu laden
            </button>
            <button className="btn" onClick={() => this.reload(Object.values(KEYS))}>
              Alle gespeicherten Daten löschen
            </button>
          </div>
          <p className="hint">Technische Meldung: {this.state.error.message}</p>
        </section>
      </main>
    );
  }
}
