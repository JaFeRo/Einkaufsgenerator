import { useEffect, useState, type Dispatch } from 'react';
import { QR_CAPACITY_Q_BYTES, RX, SCENARIOS, euro, newSeed, parseDecimal, positionGross, randomPosition, type Faults, type Position } from '../dakz';
import type { Action, AppState } from './state';

const RATES = [0, 7, 19, 5, 8, 13, 21];

/** Dezimalfeld, das Zwischenstände wie „0,“ beim Tippen zulässt. */
function DecimalInput({ value, onChange, id, digits }: { value: number; onChange: (n: number) => void; id: string; digits: number }) {
  const fmt = (n: number) => (digits === 2 ? n.toFixed(2) : String(n)).replace('.', ',');
  const [draft, setDraft] = useState(fmt(value));
  useEffect(() => {
    if (parseDecimal(draft) !== value) setDraft(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      id={id}
      className="num"
      inputMode="decimal"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(parseDecimal(e.target.value));
      }}
      onBlur={() => setDraft(fmt(value))}
    />
  );
}

function toLocalInput(epoch: number): string {
  const d = new Date(epoch * 1000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

const FAULTS: { key: keyof Faults; label: string; title: string }[] = [
  { key: 'totalMismatch', label: 'K7 ≠ Summe', title: 'UMS_BRUTTO weicht um 1,00 € ab' },
  { key: 'endBeforeStart', label: 'Ende vor Start', title: 'BON_ENDE liegt 60 s vor BON_START' },
  { key: 'dropE', label: 'E-Zeile fehlt', title: 'Erweiterte Datenzeile weglassen' },
  { key: 'crlf', label: 'CRLF statt LF', title: 'Windows-Zeilenumbrüche' },
  { key: 'noPositions', label: 'Keine Positionen', title: 'Keine P-Zeilen' },
  { key: 'rateWithSpace', label: 'Satz „19 “', title: 'Steuersatz mit Leerzeichen wie im PDF-Regex' }
];

export function Editor({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const { receipt, merchant, options } = state;
  const setPositions = (positions: Position[]) => dispatch({ type: 'receipt', patch: { positions } });
  const updatePos = (i: number, patch: Partial<Position>) => setPositions(receipt.positions.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const bonInvalid = !RX.bonNr.test(receipt.bonNr);
  const gross = receipt.positions.reduce((a, p) => a + positionGross(p), 0);

  return (
    <section className="panel no-print" aria-labelledby="h-einkauf">
      <h2 id="h-einkauf">Einkauf</h2>

      <div className="section">
        <h3>
          Szenario <small>füllt den Bon mit Testdaten</small>
        </h3>
        <div className="chips">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className="chip"
              title={s.description}
              aria-pressed={state.scenarioId === s.id}
              onClick={() => dispatch({ type: 'scenario', id: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Kopfdaten</h3>
        <div className="grid2">
          <label className="field">
            Händler (nur Bon)
            <input id="merchant-name" value={merchant.name} onChange={(e) => dispatch({ type: 'merchant', patch: { name: e.target.value } })} />
          </label>
          <label className="field">
            Anschrift (nur Bon)
            <input id="merchant-address" value={merchant.address} onChange={(e) => dispatch({ type: 'merchant', patch: { address: e.target.value } })} />
          </label>
          <label className="field">
            BON_NR (K4)
            <input
              id="bon-nr"
              className={`num ${bonInvalid ? 'invalid' : ''}`}
              inputMode="numeric"
              value={receipt.bonNr}
              onChange={(e) => dispatch({ type: 'receipt', patch: { bonNr: e.target.value.trim() } })}
            />
          </label>
          <label className="field">
            Externe Referenz (E6)
            <input id="external-ref" value={receipt.externalRef} onChange={(e) => dispatch({ type: 'receipt', patch: { externalRef: e.target.value } })} />
          </label>
          <label className="field">
            BON_START (K5, Ortszeit)
            <input
              id="bon-start"
              type="datetime-local"
              step="1"
              value={toLocalInput(receipt.start)}
              onChange={(e) => {
                const t = new Date(e.target.value).getTime();
                if (Number.isNaN(t)) return;
                const start = Math.floor(t / 1000);
                dispatch({ type: 'receipt', patch: { start, end: start + (receipt.end - receipt.start) } });
              }}
            />
          </label>
          <label className="field">
            Dauer in s (K6 − K5)
            <input
              id="bon-duration"
              className="num"
              type="number"
              min={0}
              value={receipt.end - receipt.start}
              onChange={(e) => dispatch({ type: 'receipt', patch: { end: receipt.start + Math.max(0, parseInt(e.target.value || '0', 10)) } })}
            />
          </label>
        </div>
      </div>

      <div className="section">
        <h3>
          Positionen{' '}
          <small>
            {receipt.positions.length} · {euro(gross)}
            {gross <= 5000 && ' · unter der 50-€-Grenze'}
          </small>
        </h3>
        <div className="table-scroll">
          <table className="pos">
            <thead>
              <tr>
                <th>Artikeltext (P7)</th>
                <th>Menge</th>
                <th>Einheit</th>
                <th>Einzelpreis</th>
                <th>MwSt %</th>
                <th title="Erstattungsfähig (P3)">Erst.</th>
                <th style={{ textAlign: 'right' }}>Brutto</th>
                <th>
                  <span hidden>Entfernen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {receipt.positions.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input id={`p${i}-text`} aria-label="Artikeltext" value={p.text} onChange={(e) => updatePos(i, { text: e.target.value })} />
                  </td>
                  <td style={{ width: 66 }}>
                    <DecimalInput id={`p${i}-qty`} digits={3} value={p.qty} onChange={(qty) => updatePos(i, { qty })} />
                  </td>
                  <td style={{ width: 74 }}>
                    <input id={`p${i}-unit`} aria-label="Einheit" value={p.unit} onChange={(e) => updatePos(i, { unit: e.target.value })} />
                  </td>
                  <td style={{ width: 88 }}>
                    <DecimalInput id={`p${i}-price`} digits={2} value={p.unitPrice} onChange={(unitPrice) => updatePos(i, { unitPrice })} />
                  </td>
                  <td style={{ width: 64 }}>
                    <select id={`p${i}-vat`} aria-label="Steuersatz" value={p.vat} onChange={(e) => updatePos(i, { vat: Number(e.target.value) })}>
                      {(RATES.includes(p.vat) ? RATES : [...RATES, p.vat]).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ width: 34, textAlign: 'center' }}>
                    <input id={`p${i}-ref`} type="checkbox" aria-label="erstattungsfähig" checked={p.refundable} onChange={(e) => updatePos(i, { refundable: e.target.checked })} />
                  </td>
                  <td className="sum">{(positionGross(p) / 100).toFixed(2).replace('.', ',')}</td>
                  <td>
                    <button className="icon-btn" aria-label={`Position ${i + 1} entfernen`} onClick={() => setPositions(receipt.positions.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPositions([...receipt.positions, { text: 'Neuer Artikel', qty: 1, unit: 'Stück', unitPrice: 10, vat: 19, refundable: true }])}>
            + Position
          </button>
          <button className="btn" onClick={() => setPositions([...receipt.positions, randomPosition(newSeed())])}>
            + Zufallsartikel
          </button>
        </div>
      </div>

      <div className="section">
        <h3>
          QR-Erzeugung <small>Fehlerkorrektur Q, Byte-Modus UTF-8</small>
        </h3>
        <div className="grid2">
          <label className="field">
            Grenze je Code in Byte
            <input
              id="limit"
              className="num"
              type="number"
              min={200}
              max={QR_CAPACITY_Q_BYTES}
              value={options.limitBytes}
              onChange={(e) => dispatch({ type: 'options', patch: { limitBytes: Math.min(QR_CAPACITY_Q_BYTES, Math.max(200, parseInt(e.target.value || '0', 10) || 200)) } })}
            />
          </label>
          <label className="field">
            Steuersatz-Format
            <select id="rate-style" value={options.rateStyle} onChange={(e) => dispatch({ type: 'options', patch: { rateStyle: e.target.value as 'plain' | 'fixed' } })}>
              <option value="plain">19 (wie Beispiele)</option>
              <option value="fixed">19,00 (wie Feldbeispiel)</option>
            </select>
          </label>
          <label className="field">
            TSE-Daten
            <select id="tse-mode" value={state.tseMode} onChange={(e) => dispatch({ type: 'tseMode', value: e.target.value as 'random' | 'ecdsa' })}>
              <option value="random">Zufällig (Base64)</option>
              <option value="ecdsa">Echte ECDSA-Signatur (P-384)</option>
            </select>
          </label>
        </div>
        <p className="hint">Höchstens {QR_CAPACITY_Q_BYTES.toLocaleString('de-DE')} Byte (Version 40, Q). Kleinere Werte erzwingen die Aufteilung auf mehrere Codes.</p>
        <label className="check">
          <input type="checkbox" checked={options.trailingLF} onChange={(e) => dispatch({ type: 'options', patch: { trailingLF: e.target.checked } })} />
          <span>
            Abschließendes LF<small>EBNF verlangt LF nach jedem record; Beispiel 6.1 lässt es weg</small>
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={options.alwaysWriteTotal} onChange={(e) => dispatch({ type: 'options', patch: { alwaysWriteTotal: e.target.checked } })} />
          <span>
            K3 Gesamtanzahl immer schreiben<small>Pflicht erst ab zwei Codes, sonst optional</small>
          </span>
        </label>
      </div>

      <div className="section">
        <h3>
          Fehler einbauen <small>für Negativtests</small>
        </h3>
        <div className="chips">
          {FAULTS.map((f) => (
            <button
              key={f.key}
              className="chip fault"
              title={f.title}
              aria-pressed={!!options.faults[f.key]}
              onClick={() => dispatch({ type: 'fault', key: f.key, on: !options.faults[f.key] })}
            >
              {f.label}
            </button>
          ))}
          <button className="chip fault" title="Mit Fehlerkorrektur M statt Q kodieren, wie in den Zoll-Beispielen" aria-pressed={state.eccOverride === 'M'} onClick={() => dispatch({ type: 'ecc', value: state.eccOverride ? null : 'M' })}>
            ECC M statt Q
          </button>
        </div>
      </div>
    </section>
  );
}
