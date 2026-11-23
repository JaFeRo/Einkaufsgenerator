import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { DEMO_MERCHANTS, computeTotals, demoMerchant, euro, toMerchant } from '../dakz';
import { receiptJob } from '../print/receiptJob';
import { printSettings, printerError, send, usePrinter } from '../print/usePrinter';
import { DEFAULT_MODULE_DOTS } from '../qr/layout';
import { historyApi, parseHistory, refundCents, refundNotes, useHistory, type HistoryEntry } from './demoHistory';
import { DEMO_OPTIONS, MONOPOLY_CENTS, monopolyNotes } from './demoState';
import { download } from './exporting';
import { Receipt } from './Receipt';
import { ScanOverlay } from './ScanOverlay';
import { renderBon } from './useCodes';

type Filter = 'all' | 'open' | 'voided';

const pad = (n: number) => String(n).padStart(2, '0');
/** „23.11.2026 14:05“ in Ortszeit */
export function fmtTime(ms: number, withYear = true): string {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${withYear ? d.getFullYear() : ''} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const notes = (n: number) => `${n} M`;

interface Props {
  onClose: () => void;
  notify: (m: string) => void;
}

/** Verlauf der in der Demo erstellten Ausfuhrkassenzettel: ansehen, entwerten, Erstattung in Euro und Spielgeld. */
export function DemoHistory({ onClose, notify }: Props) {
  const entries = useHistory();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [scan, setScan] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const voidedCount = entries.filter((e) => e.voidedAt).length;
  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      entries
        .filter((e) => (filter === 'all' ? true : filter === 'open' ? !e.voidedAt : !!e.voidedAt))
        .filter((e) => {
          if (!q) return true;
          const gross = euro(computeTotals(e.receipt.positions).gross);
          return [e.receipt.bonNr, e.merchantName, gross, fmtTime(e.createdAt)].some((s) => s.toLowerCase().includes(q));
        })
        .slice()
        .reverse(),
    [entries, filter, q]
  );
  const current = entries.find((e) => e.id === selected) ?? null;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    if (scan) return; // Der Scanmodus schließt mit Esc selbst
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (selected) setSelected(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scan, selected, onClose]);

  const saved = (ok: boolean) => {
    if (!ok) notify('Browser-Speicher voll: bitte den Verlauf exportieren und anschließend leeren');
  };
  const setVoided = (e: HistoryEntry, on: boolean) => {
    saved(historyApi.setVoided(e.id, on));
    notify(on ? `Bon ${e.receipt.bonNr} entwertet` : `Entwertung von Bon ${e.receipt.bonNr} zurückgenommen`);
  };

  const exportFile = () => {
    if (!entries.length) return notify('Der Verlauf ist leer');
    const d = new Date();
    download(new Blob([historyApi.exportJson()], { type: 'application/json' }), `dakz-demo-verlauf-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`);
  };
  const importFile = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    try {
      const incoming = parseHistory(JSON.parse(await file.text()));
      if (!incoming.length) return notify('Keine Bons in der Datei gefunden');
      const r = historyApi.import(incoming);
      saved(r.saved);
      notify(`${r.added} Bon${r.added === 1 ? '' : 's'} übernommen${r.updated ? `, ${r.updated} Entwertung${r.updated === 1 ? '' : 'en'} ergänzt` : ''}`);
    } catch {
      notify('Die Datei ist kein gültiger Verlauf (JSON)');
    }
  };
  const clearAll = () => {
    if (!entries.length) return;
    if (!window.confirm(`Den ganzen Verlauf mit ${entries.length} Bons löschen? Das lässt sich nicht rückgängig machen. Vorher exportieren?`)) return;
    historyApi.clear();
    setSelected(null);
    notify('Verlauf geleert');
  };

  return (
    <div className="history" role="dialog" aria-modal="true" aria-labelledby="h-history" ref={dialogRef} tabIndex={-1}>
      <header className="history-head">
        <h2 id="h-history">
          Verlauf <small>{entries.length} Bons · {voidedCount} entwertet · {entries.length - voidedCount} offen</small>
        </h2>
        <button className="btn" onClick={onClose}>
          Schließen
        </button>
      </header>
      <div className="history-tools">
        <input type="search" placeholder="Bon-Nr., Händler, Betrag, Datum" aria-label="Verlauf durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="seg" role="radiogroup" aria-label="Status">
          {(
            [
              ['all', 'Alle'],
              ['open', 'Offen'],
              ['voided', 'Entwertet']
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={filter === id} aria-selected={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="history-io">
          <button className="btn" onClick={exportFile}>
            Exportieren
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Importieren
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
          <button className="link-btn" onClick={clearAll} disabled={!entries.length}>
            Verlauf leeren
          </button>
        </span>
      </div>
      <div className={`history-body ${current ? 'has-detail' : ''}`}>
        <div className="history-list-wrap">
          {shown.length === 0 ? (
            <p className="hint history-empty">
              {entries.length === 0 ? 'Noch keine Bons. Jeder Bon, der in der Demo mit „Bon abschließen“ einen QR-Code bekommt, erscheint hier.' : 'Kein Bon passt zur Suche.'}
            </p>
          ) : (
            <ul className="history-list">
              {shown.map((e) => (
                <HistoryRow key={e.id} entry={e} active={e.id === selected} onOpen={() => setSelected(e.id)} onVoid={() => setVoided(e, true)} />
              ))}
            </ul>
          )}
        </div>
        {current && <HistoryDetail key={current.id} entry={current} onBack={() => setSelected(null)} onVoided={(on) => setVoided(current, on)} onScan={() => setScan(true)} notify={notify} onSaved={saved} onRemoved={() => setSelected(null)} />}
      </div>
      {scan && current && <ScanOverlay bon={renderBon({ receipt: current.receipt, options: DEMO_OPTIONS, eccOverride: null, spec: current.spec })} bonNr={current.receipt.bonNr} duplicate={false} onClose={() => setScan(false)} />}
    </div>
  );
}

function Refund({ entry, compact = false }: { entry: HistoryEntry; compact?: boolean }) {
  const cents = refundCents(entry.receipt);
  if (!cents) return <span className="refund none">keine Erstattung</span>;
  const n = refundNotes(cents);
  return compact ? (
    <span className="refund">
      Erstattung {euro(cents)} · <b>{notes(n)}</b>
    </span>
  ) : (
    <dl className="refund-box">
      <dt>Erstattung (MwSt. der erstattungsfähigen Positionen)</dt>
      <dd className="mono">{euro(cents)}</dd>
      <dt>Auszahlung in Monopoly-Geld</dt>
      <dd className="mono">
        <b>{notes(n)}</b> = {euro(n * MONOPOLY_CENTS)}
      </dd>
    </dl>
  );
}

function HistoryRow({ entry, active, onOpen, onVoid }: { entry: HistoryEntry; active: boolean; onOpen: () => void; onVoid: () => void }) {
  const gross = computeTotals(entry.receipt.positions).gross;
  return (
    <li className={`history-row ${entry.voidedAt ? 'is-voided' : ''} ${active ? 'active' : ''}`}>
      <button className="history-open" onClick={onOpen} aria-label={`Bon ${entry.receipt.bonNr} öffnen`}>
        <span className="h-when">
          <b className="mono">{entry.receipt.bonNr}</b>
          <small>{fmtTime(entry.createdAt)}</small>
        </span>
        <span className="h-who">
          {entry.merchantName}
          {entry.monopoly && (
            <span className="m-tag" title="Mit Monopoly-Preisen erstellt">
              Monopoly
            </span>
          )}
        </span>
        <span className="h-sum">
          <b className="mono">{euro(gross)}</b>
          {entry.monopoly && <small> · {notes(monopolyNotes(gross))}</small>}
          <Refund entry={entry} compact />
        </span>
      </button>
      <span className="h-status">
        {entry.voidedAt ? (
          <span className="pill err" title={`Entwertet am ${fmtTime(entry.voidedAt)}`}>
            entwertet {fmtTime(entry.voidedAt, false)}
          </span>
        ) : (
          <button className="btn void-btn" onClick={onVoid}>
            Entwerten
          </button>
        )}
      </span>
    </li>
  );
}

interface DetailProps {
  entry: HistoryEntry;
  onBack: () => void;
  onVoided: (on: boolean) => void;
  onScan: () => void;
  notify: (m: string) => void;
  onSaved: (ok: boolean) => void;
  onRemoved: () => void;
}

function HistoryDetail({ entry, onBack, onVoided, onScan, notify, onSaved, onRemoved }: DetailProps) {
  const [note, setNote] = useState(entry.note);
  // Notiz auch sichern, wenn der Verlauf ohne Verlassen des Feldes geschlossen wird
  const latest = useRef({ note, stored: entry.note });
  latest.current = { note, stored: entry.note };
  useEffect(
    () => () => {
      const { note: n, stored } = latest.current;
      if (n !== stored) historyApi.setNote(entry.id, n);
    },
    [entry.id]
  );
  const dm = demoMerchant(entry.merchantId) ?? DEMO_MERCHANTS[0];
  const merchant = toMerchant(dm);
  const bon = useMemo(() => renderBon({ receipt: entry.receipt, options: DEMO_OPTIONS, eccOverride: null, spec: entry.spec }), [entry.receipt, entry.spec]);
  const printer = usePrinter();
  const canPrint = !!(printer.printer || printer.prefs.kind);
  const nonRefundable = entry.receipt.positions.filter((p) => !p.refundable).length;

  const print = async () => {
    const ok = await send(
      () => receiptJob({ receipt: entry.receipt, merchant, bon, moduleDots: DEFAULT_MODULE_DOTS, settings: printSettings(printer.prefs, 80), slogan: dm.slogan, footer: dm.footer }),
      'Bon wird gedruckt'
    );
    notify(ok ? 'Bon an den Drucker gesendet' : (printerError() ?? 'Druck fehlgeschlagen'));
  };
  const undo = () => {
    if (window.confirm(`Entwertung von Bon ${entry.receipt.bonNr} zurücknehmen? Der Bon gilt dann wieder als offen.`)) onVoided(false);
  };
  const remove = () => {
    if (!window.confirm(`Bon ${entry.receipt.bonNr} aus dem Verlauf löschen?`)) return;
    onSaved(historyApi.remove(entry.id));
    onRemoved();
    notify(`Bon ${entry.receipt.bonNr} aus dem Verlauf gelöscht`);
  };

  return (
    <section className="history-detail" aria-label={`Bon ${entry.receipt.bonNr}`}>
      <button className="link-btn history-back" onClick={onBack}>
        ← Zurück zur Liste
      </button>
      <div className="row between">
        <h3>
          Bon <span className="mono">{entry.receipt.bonNr}</span> <small>{entry.merchantName}</small>
        </h3>
        {entry.voidedAt ? <span className="pill err">entwertet am {fmtTime(entry.voidedAt)}</span> : <span className="pill ok">offen</span>}
      </div>
      <p className="hint">
        Erstellt {fmtTime(entry.createdAt)} · Fassung {entry.spec}
        {entry.monopoly && ' · Monopoly-Preise (1 M = 10 €)'}
      </p>
      <Refund entry={entry} />
      {nonRefundable > 0 && (
        <p className="hint">
          {nonRefundable} Position{nonRefundable > 1 ? 'en sind' : ' ist'} nicht erstattungsfähig und nicht eingerechnet.
        </p>
      )}
      <div className="row">
        {entry.voidedAt ? (
          <button className="btn" onClick={undo}>
            Entwertung zurücknehmen
          </button>
        ) : (
          <button className="btn primary big" onClick={() => onVoided(true)}>
            Entwerten
          </button>
        )}
        <button className="btn" onClick={onScan} disabled={!bon.codes.some((c) => c.matrix)}>
          QR groß anzeigen
        </button>
        {canPrint && (
          <button className="btn" onClick={print} disabled={!!printer.busy}>
            {printer.busy ? 'Druckt …' : 'Bon drucken'}
          </button>
        )}
      </div>
      <label className="field">
        Notiz
        <textarea
          rows={2}
          maxLength={500}
          placeholder="z. B. Reisepass geprüft, bar ausgezahlt"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== entry.note && onSaved(historyApi.setNote(entry.id, note))}
        />
      </label>
      <div className="history-bon" style={{ '--bon-scale': 0.72 } as CSSProperties}>
        <Receipt
          receipt={entry.receipt}
          merchant={merchant}
          bon={bon}
          paper={80}
          moduleDots={DEFAULT_MODULE_DOTS}
          variant="demo"
          slogan={dm.slogan}
          footer={dm.footer}
          voided={entry.voidedAt ? `am ${fmtTime(entry.voidedAt)}` : undefined}
        />
      </div>
      <button className="link-btn history-remove" onClick={remove}>
        Aus dem Verlauf löschen
      </button>
    </section>
  );
}
