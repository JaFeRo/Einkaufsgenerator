import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { DEMO_MERCHANTS, computeTotals, demoMerchant, euro, formatQty, money, positionGross, toMerchant } from '../dakz';
import { receiptJob } from '../print/receiptJob';
import { printSettings, printerError, send, usePrinter } from '../print/usePrinter';
import { DEFAULT_MODULE_DOTS } from '../qr/layout';
import { entryRefundCents, exportedQty, historyApi, isPartial, parseHistory, positionVatCents, refundCents, refundNotes, splittable, useHistory, type ExportedQty, type HistoryEntry } from './demoHistory';
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
  const voidEntry = (e: HistoryEntry, exported: ExportedQty[] | null) => {
    saved(historyApi.void(e.id, exported));
    notify(`Bon ${e.receipt.bonNr} entwertet${exported ? ' (teilweise ausgeführt)' : ''}`);
  };
  const unvoid = (e: HistoryEntry) => {
    saved(historyApi.unvoid(e.id));
    notify(`Entwertung von Bon ${e.receipt.bonNr} zurückgenommen`);
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
                <HistoryRow key={e.id} entry={e} active={e.id === selected} onOpen={() => setSelected(e.id)} />
              ))}
            </ul>
          )}
        </div>
        {current && <HistoryDetail key={current.id} entry={current} onBack={() => setSelected(null)} onVoid={(exported) => voidEntry(current, exported)} onUnvoid={() => unvoid(current)} onScan={() => setScan(true)} notify={notify} onSaved={saved} onRemoved={() => setSelected(null)} />}
      </div>
      {scan && current && <ScanOverlay bon={renderBon({ receipt: current.receipt, options: DEMO_OPTIONS, eccOverride: null, spec: current.spec })} bonNr={current.receipt.bonNr} duplicate={false} onClose={() => setScan(false)} />}
    </div>
  );
}

/** Erstattung in Euro und als Auszahlung in Monopoly-Scheinen */
function RefundBox({ cents, title }: { cents: number; title: string }) {
  const n = refundNotes(cents);
  return (
    <dl className="refund-box">
      <dt>{title}</dt>
      <dd className="mono">{euro(cents)}</dd>
      <dt>Auszahlung in Monopoly-Geld</dt>
      <dd className="mono">{n ? <><b>{notes(n)}</b> = {euro(n * MONOPOLY_CENTS)}</> : 'keine'}</dd>
    </dl>
  );
}

function HistoryRow({ entry, active, onOpen }: { entry: HistoryEntry; active: boolean; onOpen: () => void }) {
  const gross = computeTotals(entry.receipt.positions).gross;
  const refund = entryRefundCents(entry);
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
          <span className="refund">
            {entry.voidedAt ? 'erstattet' : 'Erstattung'} {refund ? <>{euro(refund)} · <b>{notes(refundNotes(refund))}</b></> : 'keine'}
          </span>
        </span>
      </button>
      <span className="h-status">
        {entry.voidedAt ? (
          <span className="pill err" title={`Entwertet am ${fmtTime(entry.voidedAt)}`}>
            entwertet {fmtTime(entry.voidedAt, false)}
            {isPartial(entry) && ' · teilweise'}
          </span>
        ) : (
          <span className="pill neutral">offen</span>
        )}
      </span>
    </li>
  );
}

interface DetailProps {
  entry: HistoryEntry;
  onBack: () => void;
  onVoid: (exported: ExportedQty[] | null) => void;
  onUnvoid: () => void;
  onScan: () => void;
  notify: (m: string) => void;
  onSaved: (ok: boolean) => void;
  onRemoved: () => void;
}

function HistoryDetail({ entry, onBack, onVoid, onUnvoid, onScan, notify, onSaved, onRemoved }: DetailProps) {
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
  const positions = entry.receipt.positions;
  const refundable = positions.map((p, i) => (p.refundable ? i : -1)).filter((i) => i >= 0);
  const [partial, setPartial] = useState(false);
  // Ausgeführte Menge je erstattungsfähiger Position; anfangs alles
  const full = () => Object.fromEntries(refundable.map((i) => [i, positions[i].qty])) as Record<number, number>;
  const [qtys, setQtys] = useState<Record<number, number>>(full);
  const picked: ExportedQty[] = refundable.filter((i) => (qtys[i] ?? 0) > 0).map((i) => ({ i, qty: qtys[i] }));
  const dm = demoMerchant(entry.merchantId) ?? DEMO_MERCHANTS[0];
  const merchant = toMerchant(dm);
  const bon = useMemo(() => renderBon({ receipt: entry.receipt, options: DEMO_OPTIONS, eccOverride: null, spec: entry.spec }), [entry.receipt, entry.spec]);
  const printer = usePrinter();
  const canPrint = !!(printer.printer || printer.prefs.kind);
  const nonRefundable = positions.length - refundable.length;
  const voided = !!entry.voidedAt;
  // Vor der Entwertung: Empfehlung für die Auswahl; danach: was bei der Entwertung festgehalten wurde
  const exported = voided ? entry.exported : partial ? picked : null;
  const cents = refundCents(entry.receipt, exported);
  const doneQty = (i: number) => exportedQty(exported, i, positions[i]);

  const print = async () => {
    const ok = await send(
      () => receiptJob({ receipt: entry.receipt, merchant, bon, moduleDots: DEFAULT_MODULE_DOTS, settings: printSettings(printer.prefs, 80), slogan: dm.slogan, footer: dm.footer }),
      'Bon wird gedruckt'
    );
    notify(ok ? 'Bon an den Drucker gesendet' : (printerError() ?? 'Druck fehlgeschlagen'));
  };
  const undo = () => {
    if (window.confirm(`Entwertung von Bon ${entry.receipt.bonNr} zurücknehmen? Der Bon gilt dann wieder als offen.`)) onUnvoid();
  };
  const remove = () => {
    if (!window.confirm(`Bon ${entry.receipt.bonNr} aus dem Verlauf löschen?`)) return;
    onSaved(historyApi.remove(entry.id));
    onRemoved();
    notify(`Bon ${entry.receipt.bonNr} aus dem Verlauf gelöscht`);
  };
  const setQty = (i: number, qty: number) => setQtys((x) => ({ ...x, [i]: Math.max(0, Math.min(positions[i].qty, qty)) }));
  const confirmVoid = () => {
    // Alles in voller Menge zählt als „alle Waren ausgeführt“
    const all = !partial || refundable.every((i) => qtys[i] === positions[i].qty);
    onVoid(all ? null : picked);
    setPartial(false);
  };
  // „1 von 2 Stück“ nur bei teilbarer Stückware, sonst die Menge vom Bon
  const qtyLabel = (p: (typeof positions)[number], q: number) => (splittable(p) ? `${formatQty(q)} von ${formatQty(p.qty)} ${p.unit}` : `${formatQty(p.qty)} ${p.unit}${q ? '' : ', nicht ausgeführt'}`);
  const partialDone = voided && isPartial(entry);

  return (
    <section className="history-detail" aria-label={`Bon ${entry.receipt.bonNr}`}>
      <button className="link-btn history-back" onClick={onBack}>
        ← Zurück zur Liste
      </button>
      <div className="row between">
        <h3>
          Bon <span className="mono">{entry.receipt.bonNr}</span> <small>{entry.merchantName}</small>
        </h3>
        {voided ? <span className="pill err">entwertet am {fmtTime(entry.voidedAt!)}</span> : <span className="pill ok">offen</span>}
      </div>
      <p className="hint">
        Erstellt {fmtTime(entry.createdAt)} · Fassung {entry.spec}
        {entry.monopoly && ' · Monopoly-Preise (1 M = 10 €)'}
      </p>

      {!voided && (
        <div className="void-panel">
          <h4>Entwerten</h4>
          <div className="seg" role="radiogroup" aria-label="Ausfuhr">
            <button role="radio" aria-checked={!partial} aria-selected={!partial} onClick={() => setPartial(false)}>
              Alle Waren ausgeführt
            </button>
            <button role="radio" aria-checked={partial} aria-selected={partial} onClick={() => setPartial(true)} disabled={!refundable.length}>
              Nur teilweise ausgeführt
            </button>
          </div>
          {partial && (
            <>
              <p className="hint">
                Anhaken, was der Kunde ausgeführt hat. Bei Stückware lässt sich die Menge mit − / + verringern; Ware nach Gewicht oder Volumen zählt ganz oder gar nicht. Der Bon wird
                trotzdem als Ganzes entwertet.
              </p>
              <ul className="void-positions">
                {positions.map((p, i) => {
                  const q = p.refundable ? (qtys[i] ?? 0) : 0;
                  const gross = positionGross({ ...p, qty: q });
                  return (
                    <li key={i} className={p.refundable ? (q < p.qty ? 'less' : '') : 'na'}>
                      <label className="check">
                        <input type="checkbox" checked={q > 0} disabled={!p.refundable} onChange={(e) => setQty(i, e.target.checked ? p.qty : 0)} aria-label={`${p.text} ausgeführt`} />
                        <span>
                          {p.text}
                          <small>
                            {p.refundable
                              ? `${qtyLabel(p, q)} · ${money(gross)} € · MwSt. ${p.vat} %: ${money(positionVatCents(gross, p.vat))} €`
                              : `${formatQty(p.qty)} ${p.unit} · ${money(positionGross(p))} € · nicht erstattungsfähig`}
                          </small>
                        </span>
                      </label>
                      {p.refundable && splittable(p) && (
                        <span className="qty">
                          <button aria-label={`${p.text}: ein Stück weniger ausgeführt`} onClick={() => setQty(i, q - 1)} disabled={q <= 0}>
                            −
                          </button>
                          <span className="mono">{q}</span>
                          <button aria-label={`${p.text}: ein Stück mehr ausgeführt`} onClick={() => setQty(i, q + 1)} disabled={q >= p.qty}>
                            +
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="row">
                <button className="link-btn" onClick={() => setQtys(full())}>
                  alles
                </button>
                <button className="link-btn" onClick={() => setQtys({})}>
                  nichts
                </button>
              </div>
            </>
          )}
          <RefundBox
            cents={cents}
            title={partial ? `Empfohlene Erstattung für die ausgeführte Ware (${picked.length} von ${refundable.length} Position${refundable.length === 1 ? '' : 'en'})` : 'Empfohlene Erstattung (MwSt. der erstattungsfähigen Positionen)'}
          />
          {nonRefundable > 0 && (
            <p className="hint">
              {nonRefundable} Position{nonRefundable > 1 ? 'en sind' : ' ist'} nicht erstattungsfähig und nicht eingerechnet.
            </p>
          )}
          <button className="btn primary big" onClick={confirmVoid}>
            Bon entwerten{cents ? ` · ${euro(cents)} / ${notes(refundNotes(cents))} erstatten` : ' ohne Erstattung'}
          </button>
        </div>
      )}

      {voided && (
        <>
          <RefundBox cents={cents} title={partialDone ? 'Erstattung für die ausgeführten Positionen' : 'Erstattung (alle Waren ausgeführt)'} />
          {partialDone && (
            <ul className="void-positions done">
              {positions.map((p, i) => {
                const q = doneQty(i);
                const state = !p.refundable ? 'na' : q >= p.qty ? 'yes' : q > 0 ? 'some' : 'no';
                return (
                  <li key={i} className={state}>
                    <span aria-hidden="true">{{ na: '–', yes: '✓', some: '◐', no: '✗' }[state]}</span>
                    <span>
                      <span className="pos-name">{p.text}</span>
                      <small>
                        {state === 'na'
                          ? `${money(positionGross(p))} € · nicht erstattungsfähig`
                          : state === 'yes'
                            ? `${money(positionGross(p))} € · ausgeführt`
                            : state === 'some'
                              ? `${qtyLabel(p, q)} ausgeführt · ${money(positionGross({ ...p, qty: q }))} € von ${money(positionGross(p))} €`
                              : `${money(positionGross(p))} € · nicht ausgeführt, keine Erstattung`}
                      </small>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className="row">
        {voided && (
          <button className="btn" onClick={undo}>
            Entwertung zurücknehmen
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
          voided={entry.voidedAt ? `am ${fmtTime(entry.voidedAt)}${partialDone ? ' · teilweise ausgeführt' : ''}` : undefined}
        />
      </div>
      <button className="link-btn history-remove" onClick={remove}>
        Aus dem Verlauf löschen
      </button>
    </section>
  );
}
