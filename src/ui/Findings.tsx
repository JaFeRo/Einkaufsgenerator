import type { Finding } from '../dakz';

/** Gemeinsame Darstellung von Befunden für Generator und Rückprüfung. */
export function Findings({ items, okText }: { items: (Finding & { prefix?: string })[]; okText: string }) {
  if (!items.length)
    return (
      <ul className="findings">
        <li className="ok">{okText}</li>
      </ul>
    );
  const sorted = [...items].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  return (
    <ul className="findings">
      {sorted.map((f, i) => (
        <li key={i} className={f.severity}>
          {f.prefix && <span className="ref">{f.prefix}</span>}
          {f.ref && <span className="ref">{f.ref}</span>}
          {f.line && <span className="ref">Z. {f.line}</span>}
          {f.message}
        </li>
      ))}
    </ul>
  );
}

export function StatusPill({ errors, warnings, okText = 'Spezifikationskonform' }: { errors: number; warnings: number; okText?: string }) {
  if (errors) return <span className="pill err">{errors} Fehler</span>;
  if (warnings) return <span className="pill warn">{warnings} {warnings === 1 ? 'Warnung' : 'Warnungen'}</span>;
  return <span className="pill ok">{okText}</span>;
}

/** CSV mit farbig markierten Zeilentypen und sichtbaren Zeilenenden. */
export function CsvView({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <pre className="csv">
      {lines.map((raw, i) => {
        if (raw === '' && i === lines.length - 1) return null;
        const cr = raw.endsWith('\r');
        const line = cr ? raw.slice(0, -1) : raw;
        const parts = line.slice(1).split(';');
        return (
          <span key={i}>
            <span className={line[0]}>
              <span className="t">{line[0]}</span>
              {parts.map((p, j) => (
                <span key={j}>
                  {j > 0 && <span className="sep">;</span>}
                  {p}
                </span>
              ))}
            </span>
            {cr && <span className="lf">␍</span>}
            {i < lines.length - 1 && <span className="lf">␊</span>}
            {i < lines.length - 1 && '\n'}
          </span>
        );
      })}
    </pre>
  );
}
