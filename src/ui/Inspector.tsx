import { useState, type Dispatch } from 'react';
import { formatEpoch, SPEC } from '../dakz';
import { download, qrPng, seriesZip } from './exporting';
import { CsvView, Findings, StatusPill } from './Findings';
import { shareHash, type Action, type AppState } from './state';
import type { RenderedBon } from './useCodes';

/** Bedruckbare Breite in mm bei 3 mm Rand je Seite. */
const printableMm = (paper: number) => paper - 6;
/** 203 dpi → 0,125 mm je Punkt; drei Punkte je Modul gelten als sicher lesbar. */
const MIN_MODULE_MM = 0.375;

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  bon: RenderedBon;
  notify: (msg: string) => void;
}

export function Inspector({ state, dispatch, bon, notify }: Props) {
  const [active, setActive] = useState(0);
  const [seriesN, setSeriesN] = useState(20);
  const [busy, setBusy] = useState<string | null>(null);
  const idx = Math.min(active, bon.codes.length - 1);
  const code = bon.codes[idx];
  const limit = state.options.limitBytes;
  const k = code.check.records[0]?.[0] === 'K' ? code.check.records[0] : [];

  const findings = bon.codes.flatMap((c) => [
    ...(c.qrError ? [{ severity: 'error' as const, message: c.qrError, prefix: bon.codes.length > 1 ? `QR ${c.index}` : undefined }] : []),
    ...c.check.findings.map((f) => ({ ...f, prefix: bon.codes.length > 1 ? `QR ${c.index}` : undefined }))
  ]);
  if (bon.ecc !== 'Q') findings.push({ severity: 'warning', ref: 'V4', message: `Kodiert mit Fehlerkorrektur ${bon.ecc}, die Spezifikation verlangt Q`, prefix: undefined });

  const largest = Math.max(...bon.codes.map((c) => c.matrix?.size ?? 0));
  const moduleMm = largest ? printableMm(state.paper) / (largest + 8) : 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.text);
      notify('QR-Inhalt kopiert');
    } catch {
      notify('Kopieren nicht möglich – Text bitte markieren');
    }
  };

  const share = async () => {
    const url = window.location.href.split('#')[0] + shareHash(state);
    window.history.replaceState(null, '', url);
    try {
      await navigator.clipboard.writeText(url);
      notify('Link zum Bon kopiert');
    } catch {
      notify('Link steht in der Adresszeile');
    }
  };

  const pngAll = async () => {
    for (const c of bon.codes) {
      if (!c.matrix) continue;
      download(await qrPng(c.matrix, `Bon ${state.receipt.bonNr} · QR ${c.index}/${c.count}`), `bon-${state.receipt.bonNr}-qr-${c.index}-von-${c.count}.png`);
    }
  };

  const txtAll = () => {
    bon.codes.forEach((c) => download(new Blob([c.text], { type: 'text/plain;charset=utf-8' }), `bon-${state.receipt.bonNr}-qr-${c.index}-von-${c.count}.txt`));
  };

  const series = async () => {
    setBusy('0');
    try {
      const blob = await seriesZip(state, seriesN, (i) => setBusy(String(i)));
      download(blob, `dakz-serie-${state.scenarioId}-${seriesN}.zip`);
      notify(`${seriesN} Bons exportiert`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel inspector no-print" aria-labelledby="h-daten">
      <h2 id="h-daten">QR-Inhalt &amp; Prüfung</h2>
      <div className="status">
        <StatusPill errors={bon.errors} warnings={bon.warnings} />
        <span className="meta">
          {bon.codes.length} QR-Code{bon.codes.length > 1 ? 's' : ''} · ECC {bon.ecc} · {bon.codes.reduce((a, c) => a + c.bytes, 0).toLocaleString('de-DE')} Byte gesamt
        </span>
      </div>

      <div className="section">
        <div className="row between">
          <div className="seg" role="tablist" aria-label="QR-Code wählen">
            {bon.codes.map((c, i) => (
              <button key={c.index} role="tab" aria-selected={i === idx} onClick={() => setActive(i)}>
                QR {c.index}/{c.count}
              </button>
            ))}
          </div>
          <button className="btn" onClick={copy}>
            Inhalt kopieren
          </button>
        </div>
        <div className="meter">
          <div className="lbl">
            <span>
              {code.bytes.toLocaleString('de-DE')} / {limit.toLocaleString('de-DE')} Byte · {code.chars.toLocaleString('de-DE')} Zeichen
            </span>
            <span>{code.matrix ? `Version ${code.matrix.version} · ${code.matrix.size}×${code.matrix.size} Module` : 'nicht kodierbar'}</span>
          </div>
          <div className="bar">
            <i className={code.bytes > limit || !code.matrix ? 'over' : ''} style={{ width: `${Math.min(100, (code.bytes / limit) * 100).toFixed(1)}%` }} />
          </div>
        </div>
        <CsvView text={code.text} />
      </div>

      <div className="section">
        <h3>Befunde</h3>
        <Findings items={findings} okText="Alle Felder passen zu den regulären Ausdrücken der Spezifikation, Summen sind stimmig." />
      </div>

      <div className="section">
        <h3>Kopfzeile entschlüsselt</h3>
        <dl className="fields">
          {SPEC.K.map((s, i) => {
            const v = k[i + 1] ?? '';
            return (
              <div key={s.id} style={{ display: 'contents' }}>
                <dt>{s.id}</dt>
                <dd className="nm">{s.name}</dd>
                <dd>
                  {v || <span className="nm">leer{s.id === 'K3' ? ' → 1' : ''}</span>}
                  {(s.id === 'K5' || s.id === 'K6') && /^\d{10}$/.test(v) && <span className="nm"> = {formatEpoch(+v, true)} UTC</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div className="section">
        <h3>
          Ausgabe <small>Bildschirm, Druck, Dateien</small>
        </h3>
        <div className="row">
          <span className="hint">Papier</span>
          <div className="seg" role="radiogroup" aria-label="Papierbreite">
            {([80, 58] as const).map((w) => (
              <button key={w} role="radio" aria-selected={state.paper === w} aria-checked={state.paper === w} onClick={() => dispatch({ type: 'paper', value: w })}>
                {w} mm
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => window.print()}>
            Drucken
          </button>
        </div>
        {moduleMm > 0 && (
          <p className="hint" style={moduleMm < MIN_MODULE_MM ? { color: 'var(--warn)' } : undefined}>
            Modulgröße beim Druck ≈ {moduleMm.toFixed(2).replace('.', ',')} mm
            {moduleMm < MIN_MODULE_MM
              ? ` – unter ${String(MIN_MODULE_MM).replace('.', ',')} mm (3 Punkte bei 203 dpi). Grenze je Code senken, damit kleinere Codes entstehen.`
              : ' – ausreichend für Thermodrucker mit 203 dpi.'}
          </p>
        )}
        <div className="row">
          <button className="btn" onClick={pngAll}>
            QR als PNG
          </button>
          <button className="btn" onClick={txtAll}>
            Inhalt als TXT
          </button>
          <button className="btn" onClick={share}>
            Link teilen
          </button>
        </div>
        <div className="row">
          <label className="field" style={{ width: 110 }}>
            Serie: Anzahl
            <input id="series-n" className="num" type="number" min={1} max={500} value={seriesN} onChange={(e) => setSeriesN(Math.max(1, Math.min(500, parseInt(e.target.value || '1', 10))))} />
          </label>
          <button className="btn" style={{ alignSelf: 'end' }} onClick={series} disabled={busy !== null}>
            {busy !== null ? `Erzeuge ${busy}/${seriesN} …` : 'Serie als ZIP'}
          </button>
        </div>
        <p className="hint">Die Serie nutzt das gewählte Szenario mit neuen Zufallswerten: je Bon QR-PNGs, exakter Inhalt als TXT und eine Übersicht als CSV.</p>
      </div>
    </section>
  );
}
