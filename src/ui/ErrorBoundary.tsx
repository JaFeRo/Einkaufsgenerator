import { Component, type ErrorInfo, type ReactNode } from 'react';
import { APP_VERSION } from '../version';
import { KEYS } from './storage';

interface State {
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

/** Fängt Abstürze beim Darstellen ab, damit statt einer leeren Seite ein Ausweg angezeigt wird. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, componentStack: '', copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(_error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? '' });
  }

  /** Lädt neu und umgeht dabei eine zwischengespeicherte Startseite, damit sicher die neueste Version kommt. */
  private reload = (keys: string[]) => {
    try {
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* Speicher gesperrt – Neuladen versuchen wir trotzdem */
    }
    window.location.replace(`${window.location.pathname}?neu=${Date.now()}${window.location.hash}`);
  };

  private details(): string {
    const e = this.state.error;
    return [
      `Version: ${APP_VERSION}`,
      `Adresse: ${window.location.href}`,
      `Browser: ${navigator.userAgent}`,
      `Meldung: ${e?.message}`,
      '',
      e?.stack ?? '',
      '',
      'Komponenten:',
      this.state.componentStack.trim()
    ].join('\n');
  }

  private copy = () => {
    navigator.clipboard?.writeText(this.details()).then(
      () => this.setState({ copied: true }),
      () => undefined
    );
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="about" role="alert" style={{ paddingTop: 48 }}>
        <section className="panel" style={{ padding: '22px 26px' }}>
          <h2>Die Anwendung ist abgestürzt</h2>
          <p>
            Bitte zuerst einfach neu laden – das holt auch die neueste Version, falls der Browser noch eine ältere zwischengespeichert hatte. Tritt der Fehler danach
            wieder auf, liegt vermutlich ein beschädigter Speicherstand vor: Dann hilft die zweite Option, deine gespeicherten Bons bleiben dabei erhalten.
          </p>
          <div className="row">
            <button className="btn primary" onClick={() => this.reload([])}>
              Neu laden
            </button>
            <button className="btn" onClick={() => this.reload([KEYS.current, KEYS.demo])}>
              Aktuellen Bon und Demo-Einkauf verwerfen
            </button>
            <button className="btn" onClick={() => this.reload(Object.values(KEYS))}>
              Alle gespeicherten Daten löschen
            </button>
          </div>
          <p className="hint">
            Technische Meldung: {this.state.error.message} · Version {APP_VERSION}
          </p>
          <details>
            <summary className="hint" style={{ cursor: 'pointer' }}>
              Fehlerdetails
            </summary>
            <pre className="csv" style={{ whiteSpace: 'pre-wrap', maxHeight: 240 }}>
              {this.details()}
            </pre>
            <button className="btn" onClick={this.copy}>
              {this.state.copied ? 'Kopiert' : 'Details kopieren'}
            </button>
          </details>
        </section>
      </main>
    );
  }
}
