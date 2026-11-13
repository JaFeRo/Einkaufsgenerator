import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  DEFAULT_OPTIONS,
  DEMO_MERCHANTS,
  computeTotals,
  demoCategories,
  demoMerchant,
  demoPosition,
  euro,
  fakeTse,
  formatQty,
  money,
  newSeed,
  parseDecimal,
  positionGross,
  prng,
  toMerchant,
  type DemoItem,
  type Merchant,
  type Receipt as ReceiptData,
  type SpecVersion
} from '../dakz';
import { receiptJob } from '../print/receiptJob';
import { printSettings, printerError, send, usePrinter } from '../print/usePrinter';
import { DEFAULT_MODULE_DOTS } from '../qr/layout';
import { MAX_POSITION_CENTS, MIN_GROSS_CENTS, canClose, cartPositions, demoReducer, fitsLimits, latin1Friendly, merchantFromHash, sanitizeDemo, type CartLine } from './demoState';
import { Receipt } from './Receipt';
import { ScanOverlay } from './ScanOverlay';
import { KEYS, loadJson, saveJson } from './storage';
import type { BonCounter } from './useBonCounter';
import { renderBon, type RenderedBon } from './useCodes';

/** Feste Einstellungen der Demo: ECC Q, keine Fehlerinjektion, Standardgrenze. */
const DEMO_OPTIONS = { ...DEFAULT_OPTIONS, faults: {} };

const nowSec = () => Math.floor(Date.now() / 1000);

/** Bongröße in der Demo: 100 % = Standard, „Einpassen“ rechnet die Größe passend zur Fensterhöhe aus. */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 1.6;
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
// Auf das nächste Zehntel springen, auch von einem eingepassten Wert wie 57 %
const zoomStep = (z: number, dir: 1 | -1) => clampZoom(dir > 0 ? Math.floor(z * 10 + 1e-6) / 10 + 0.1 : Math.ceil(z * 10 - 1e-6) / 10 - 0.1);

interface DemoView {
  zoom: number;
  /** Bei jeder Änderung des Bons neu einpassen */
  auto: boolean;
}

function loadView(): DemoView {
  const v = loadJson<Partial<DemoView>>(KEYS.demoView, {});
  return { zoom: typeof v.zoom === 'number' && Number.isFinite(v.zoom) ? clampZoom(v.zoom) : 1, auto: v.auto === true };
}

// Kontrollkästchen zählen nicht als Eingabefeld, damit die Kurzbefehle nach einem Klick darauf weiter greifen
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['TEXTAREA', 'SELECT'].includes(t.tagName) || (t instanceof HTMLInputElement && !['checkbox', 'radio', 'button'].includes(t.type)));

interface Props {
  spec: SpecVersion;
  counter: BonCounter;
  notify: (m: string) => void;
  onOpenInBench: (receipt: ReceiptData, merchant: Merchant) => void;
}

/**
 * Demo-Modus für Präsentationen: links eine einfache Kasse, rechts groß der Kassenbon.
 * Tastatur: Enter schließt ab, Leertaste nächster Kunde, S zeigt den QR-Code groß, Esc beendet das Vollbild.
 */
export function Demo({ spec, counter, notify, onOpenInBench }: Props) {
  const [state, dispatch] = useReducer(demoReducer, undefined, () => sanitizeDemo(loadJson<unknown>(KEYS.demo, null), merchantFromHash(window.location.hash)));
  const merchant = demoMerchant(state.merchantId) ?? DEMO_MERCHANTS[0];
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [weighing, setWeighing] = useState<DemoItem | null>(null);
  const [weight, setWeight] = useState('');
  const [freeText, setFreeText] = useState('');
  const [freePrice, setFreePrice] = useState('');
  const [freeVat, setFreeVat] = useState<7 | 19>(19);
  const [scan, setScan] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [view, setView] = useState(loadView);
  const areaRef = useRef<HTMLElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const bonRef = useRef<HTMLDivElement>(null);
  // Einpassen läuft in wenigen Durchgängen, weil nicht jedes Maß linear mitwächst
  const fitting = useRef(0);
  const [fitTick, setFitTick] = useState(0);
  /** QR-Code auf dem Bildschirm so klein, dass ein Handy ihn schlecht liest */
  const [smallQr, setSmallQr] = useState(false);
  const zoom = view.zoom;
  const fit = () => {
    fitting.current = 4;
    setFitTick((t) => t + 1);
  };

  useEffect(() => {
    saveJson(KEYS.demoView, view);
  }, [view]);

  // Ein Neuladen während der Präsentation verliert nichts.
  useEffect(() => {
    saveJson(KEYS.demo, state);
  }, [state]);

  // Deep-Link #demo/<händler>
  useEffect(() => {
    const want = `#demo/${state.merchantId}`;
    if (window.location.hash !== want) window.history.replaceState(null, '', window.location.pathname + window.location.search + want);
    setCategory(null);
    setQuery('');
    setWeighing(null);
  }, [state.merchantId]);
  useEffect(() => {
    const onHash = () => {
      const id = merchantFromHash(window.location.hash);
      if (id) dispatch({ type: 'merchant', id });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Vollbild: App-Kopf und Reiter ausblenden
  useEffect(() => {
    const onFs = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('presenting', presenting);
    return () => document.documentElement.classList.remove('presenting');
  }, [presenting]);

  const positions = useMemo(() => cartPositions(state), [state]);
  const totals = useMemo(() => computeTotals(positions), [positions]);
  const closedBon = useMemo(() => (state.closed ? renderBon({ receipt: state.closed, options: DEMO_OPTIONS, eccOverride: null, spec }) : null), [state.closed, spec]);
  const open = !state.closed;
  const ready = canClose(state);

  const shown: ReceiptData = state.closed ?? {
    bonNr: '',
    start: state.startedAt ?? nowSec(),
    end: state.startedAt ?? nowSec(),
    tseSignature: '',
    tsePublicKey: '',
    externalRef: '',
    positions
  };
  const printer = usePrinter();
  // Nur zeigen, wenn in der Werkbank schon ein Drucker verbunden wurde
  const canPrint = !!(printer.printer || printer.prefs.kind);
  const printClosed = async () => {
    if (!state.closed || !closedBon) return;
    const m = toMerchant(merchant);
    const receipt = state.closed;
    const ok = await send(
      () => receiptJob({ receipt, merchant: m, bon: closedBon, moduleDots: DEFAULT_MODULE_DOTS, settings: printSettings(printer.prefs, 80), slogan: merchant.slogan, footer: merchant.footer }),
      'Bon wird gedruckt'
    );
    notify(ok ? 'Bon an den Drucker gesendet' : (printerError() ?? 'Druck fehlgeschlagen'));
  };

  const shownBon: RenderedBon = closedBon ?? { codes: [], totals, ecc: 'Q', errors: 0, warnings: 0, spec, replaced: [] };

  const add = (item: DemoItem) => {
    if (item.unit) {
      setWeighing(item);
      setWeight('');
      return;
    }
    const same = state.lines.find((l) => l.itemId === item.id);
    if (!fitsLimits(demoPosition(item, 1), (same?.position.qty ?? 0) + 1)) notify(`Höchstens ${euro(MAX_POSITION_CENTS)} je Position`);
    else dispatch({ type: 'add', item, qty: 1, now: nowSec() });
  };

  const addWeight = (e: FormEvent) => {
    e.preventDefault();
    if (!weighing) return;
    const kg = Math.round(parseDecimal(weight) * 1000) / 1000;
    if (!(kg > 0)) return notify('Bitte ein Gewicht über 0 kg eingeben');
    if (!fitsLimits(demoPosition(weighing, 1), kg)) return notify(`Höchstens ${euro(MAX_POSITION_CENTS)} je Position`);
    dispatch({ type: 'add', item: weighing, qty: kg, now: nowSec() });
    setWeighing(null);
  };

  const addFree = (e: FormEvent) => {
    e.preventDefault();
    const text = latin1Friendly(freeText).slice(0, 255);
    const cents = Math.round(parseDecimal(freePrice) * 100);
    if (!text) return notify('Bitte einen Artikeltext eingeben');
    if (!(cents > 0 && cents <= MAX_POSITION_CENTS)) return notify(`Preis zwischen 0,01 € und ${euro(MAX_POSITION_CENTS)}`);
    dispatch({ type: 'free', position: { text, vat: freeVat, unitPrice: cents / 100, qty: 1, unit: 'Stück', refundable: true }, now: nowSec() });
    setFreeText('');
    setFreePrice('');
  };

  const close = () => {
    if (!canClose(state)) return;
    let bonNr: string;
    try {
      // Gemeinsamer Zähler: die Duplikatsprüfung im Backend läuft über BON_NR
      bonNr = counter.take();
    } catch (err) {
      notify((err as Error).message);
      return;
    }
    dispatch({ type: 'close', bonNr, now: nowSec(), tse: fakeTse(prng(newSeed())) });
  };

  const next = () => {
    setScan(false);
    dispatch({ type: 'next' });
  };

  const togglePresenting = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (presenting) {
      setPresenting(false);
    } else if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => setPresenting(true));
    } else {
      setPresenting(true);
    }
  };

  useEffect(() => {
    if (scan) return; // Der Scanmodus hat eigene Tasten
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      // Kurzbefehle greifen auch, wenn noch ein Button den Fokus hat (dessen Aktion entfällt dann), nur nicht beim Tippen
      if (e.key === 'Enter' && canClose(state)) {
        e.preventDefault();
        close();
      } else if (e.key === ' ' && state.closed) {
        e.preventDefault();
        next();
      } else if ((e.key === 's' || e.key === 'S') && state.closed) {
        setScan(true);
      } else if (e.key === 'Escape' && presenting && !document.fullscreenElement) {
        setPresenting(false);
      } else if (e.key === '+' || e.key === '=') {
        setView((v) => ({ ...v, zoom: zoomStep(v.zoom, 1), auto: false }));
      } else if (e.key === '-') {
        setView((v) => ({ ...v, zoom: zoomStep(v.zoom, -1), auto: false }));
      } else if (e.key === '0') {
        setView({ zoom: 1, auto: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const lineCount = state.lines.length;

  // Einpassen: Bon so verkleinern oder vergrößern, dass er ohne Scrollen ganz sichtbar ist
  useLayoutEffect(() => {
    const area = areaRef.current;
    const bon = bonRef.current;
    if (!fitting.current || !area || !bon) return;
    fitting.current--;
    const style = getComputedStyle(area);
    // Platz für den Bon: Höhe des Bereichs ohne Leiste, Hinweise, Abstände und Innenrand (gemessen, nicht geschätzt).
    // Auf schmalen Bildschirmen scrollt die Seite selbst; unten liegt dort die Leiste mit Summe.
    const room =
      style.overflowY === 'auto'
        ? area.clientHeight - (bon.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop) - parseFloat(style.paddingBottom) - 2
        : window.innerHeight - 96 - (toolbarRef.current?.offsetHeight ?? 0) - 24;
    const height = bon.getBoundingClientRect().height;
    if (!height || room <= 0) return;
    const next = clampZoom(Math.floor(((zoom * room) / height) * 100) / 100);
    if (Math.abs(next - zoom) >= 0.01 && fitting.current > 0) {
      setView((v) => ({ ...v, zoom: next }));
    } else {
      // Fertig: ganz nach oben, damit der komplette Bon im Blick ist
      fitting.current = 0;
      area.scrollTo({ top: 0 });
    }
  }, [fitTick, zoom]);

  // Unter etwa 2 Bildpunkten je Modul wird das Scannen vom Bildschirm unzuverlässig
  useLayoutEffect(() => {
    const svg = bonRef.current?.querySelector('.qr-block svg');
    const modules = closedBon?.codes[0]?.matrix?.size;
    setSmallQr(!!svg && !!modules && svg.getBoundingClientRect().width / (modules + 8) < 2);
  });

  // Automatisch einpassen, wenn der Bon wächst, abgeschlossen wird oder das Fenster sich ändert
  useEffect(() => {
    if (!view.auto) return;
    fit();
    const onResize = () => fit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [view.auto, lineCount, state.closed, state.merchantId, presenting]);

  // Der Bon scrollt mit: neueste Position, nach dem Abschluss der QR-Code
  useEffect(() => {
    const area = areaRef.current;
    if (!area || area.scrollHeight <= area.clientHeight) return;
    const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    // Kein „return area.scrollTo(…)“: neuere Browser liefern dort einen Promise, den React als Aufräumfunktion aufrufen würde
    if (!lineCount) {
      area.scrollTo({ top: 0, behavior });
      return;
    }
    const rows = area.querySelectorAll<HTMLElement>('.receipt .pos');
    const target = state.closed ? area.querySelector<HTMLElement>('.qr-block') : rows[rows.length - 1];
    if (!target) return;
    const t = target.getBoundingClientRect();
    const a = area.getBoundingClientRect();
    if (state.closed) area.scrollBy({ top: t.top - a.top - 16, behavior });
    else if (t.bottom > a.bottom || t.top < a.top) area.scrollBy({ top: t.bottom - a.bottom + 48, behavior });
  }, [lineCount, state.closed]);

  const q = query.trim().toLowerCase();
  const items = merchant.items.filter((i) => (!category || i.category === category) && (!q || i.text.toLowerCase().includes(q)));
  const missing = MIN_GROSS_CENTS - totals.gross;
  const errors = closedBon ? closedBon.codes.flatMap((c) => c.check.findings.filter((f) => f.severity === 'error').map((f) => ({ ...f, qr: c.index }))) : [];

  const primary = open ? (
    <button className="btn primary big" onClick={close} disabled={!ready}>
      Bon abschließen · {euro(totals.gross)}
    </button>
  ) : (
    <button className="btn primary big" onClick={next}>
      Nächster Kunde
    </button>
  );

  return (
    <main className="demo" style={{ '--m-color': merchant.color } as CSSProperties}>
      <section className="panel demo-till" aria-label="Kasse">
        <div className="merchant-picker" role="radiogroup" aria-label="Händler wählen">
          {DEMO_MERCHANTS.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={m.id === merchant.id}
              className="merchant-tile"
              style={{ '--m-color': m.color } as CSSProperties}
              onClick={() => dispatch({ type: 'merchant', id: m.id })}
            >
              <span className="m-badge" aria-hidden="true">
                {m.initials}
              </span>
              <span>
                <b>{m.name}</b>
                <small>{m.city}</small>
              </span>
            </button>
          ))}
        </div>

        <div className="section">
          <div className="row between">
            <h3>Artikel</h3>
            <input type="search" className="till-search" placeholder="Artikel suchen" aria-label="Artikel suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="chips" role="group" aria-label="Kategorie">
            <button className="chip" aria-pressed={category === null} onClick={() => setCategory(null)}>
              Alle
            </button>
            {demoCategories(merchant).map((c) => (
              <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>
                {c}
              </button>
            ))}
          </div>
          {weighing && (
            <form className="weigh" onSubmit={addWeight}>
              <label className="field">
                Gewicht in kg · {weighing.text} ({euro(Math.round(weighing.price * 100))}/kg)
                <input className="num" inputMode="decimal" autoFocus placeholder="0,452" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </label>
              <button className="btn primary" type="submit">
                Hinzufügen
              </button>
              <button className="btn" type="button" onClick={() => setWeighing(null)}>
                Abbrechen
              </button>
            </form>
          )}
          <div className="items">
            {items.map((i) => (
              <button key={i.id} className="item-tile" onClick={() => add(i)} disabled={!open}>
                <span className="nm">{i.text}</span>
                <span className="pr">
                  {euro(Math.round(i.price * 100))}
                  {i.unit && <small> /kg</small>}
                </span>
                {(i.unit || i.refundable === false) && <span className="flag">{i.unit ? 'Wiegeware' : 'nicht erstattungsfähig'}</span>}
              </button>
            ))}
            {items.length === 0 && <p className="hint">Kein Artikel gefunden.</p>}
          </div>
          <div className="row">
            {merchant.baskets.map((b, i) => (
              <button key={b.label} className="btn" disabled={!open} onClick={() => dispatch({ type: 'basket', index: i, now: nowSec() })}>
                Beispieleinkauf: {b.label}
              </button>
            ))}
          </div>
          <details className="free">
            <summary>Freie Position</summary>
            <form className="free-form" onSubmit={addFree}>
              <label className="field">
                Artikeltext
                <input value={freeText} maxLength={255} onChange={(e) => setFreeText(e.target.value)} disabled={!open} />
              </label>
              <label className="field">
                Preis in €
                <input className="num" inputMode="decimal" placeholder="0,00" value={freePrice} onChange={(e) => setFreePrice(e.target.value)} disabled={!open} />
              </label>
              <label className="field">
                MwSt
                <select value={freeVat} onChange={(e) => setFreeVat(e.target.value === '7' ? 7 : 19)} disabled={!open}>
                  <option value="19">19 %</option>
                  <option value="7">7 %</option>
                </select>
              </label>
              <button className="btn" type="submit" disabled={!open}>
                Hinzufügen
              </button>
            </form>
          </details>
        </div>

        <div className="section">
          <h3>
            Warenkorb <small>{state.lines.length === 1 ? '1 Position' : `${state.lines.length} Positionen`}</small>
          </h3>
          {state.lines.length === 0 ? (
            <p className="hint">Artikel antippen oder einen Beispieleinkauf laden.</p>
          ) : (
            <ul className="cart">
              {state.lines.map((l) => (
                <CartRow key={l.id} line={l} locked={!open} onQty={(delta) => dispatch({ type: 'qty', id: l.id, delta })} onRemove={() => dispatch({ type: 'remove', id: l.id })} />
              ))}
            </ul>
          )}
          <div className="sumline">
            <span>Summe</span>
            <span>{euro(totals.gross)}</span>
          </div>
          {open && state.lines.length > 0 && missing > 0 && (
            <p className="min-hint">Noch {euro(missing)} bis zum Mindestumsatz für den Ausfuhrkassenzettel (über 50,00 €)</p>
          )}
          <div className="row">
            {primary}
            {!open && (
              <>
                <button className="btn big" onClick={() => setScan(true)}>
                  QR groß anzeigen
                </button>
                {canPrint && (
                  <button className="btn big" onClick={printClosed} disabled={!!printer.busy}>
                    {printer.busy ? 'Druckt …' : 'Bon drucken'}
                  </button>
                )}
                <button className="btn" onClick={() => state.closed && onOpenInBench(state.closed, toMerchant(merchant))}>
                  In Werkbank öffnen
                </button>
              </>
            )}
          </div>
          <div className="row between">
            <span className="hint">Enter: abschließen · Leertaste: nächster Kunde · S: QR groß · +/−: Bongröße</span>
            <button className="btn" onClick={togglePresenting}>
              {presenting ? 'Vollbild beenden' : 'Vollbild'}
            </button>
          </div>
        </div>
      </section>

      <section className="demo-bon-area" ref={areaRef} aria-label="Kassenbon" style={{ '--bon-scale': zoom } as CSSProperties}>
        <div className="bon-zoom" ref={toolbarRef} role="group" aria-label="Bongröße">
          <button className="btn" onClick={() => setView((v) => ({ ...v, zoom: zoomStep(v.zoom, -1), auto: false }))} disabled={zoom <= ZOOM_MIN} aria-label="Bon verkleinern" title="Verkleinern (−)">
            −
          </button>
          <span className="mono zoom-val" aria-live="polite">
            {Math.round(zoom * 100)} %
          </span>
          <button className="btn" onClick={() => setView((v) => ({ ...v, zoom: zoomStep(v.zoom, 1), auto: false }))} disabled={zoom >= ZOOM_MAX} aria-label="Bon vergrößern" title="Vergrößern (+)">
            +
          </button>
          <button className="btn" onClick={fit} title="So groß wie möglich, ohne dass der Bon scrollt">
            Einpassen
          </button>
          <label className="check" title="Bei jeder neuen Position und nach dem Abschluss neu einpassen">
            <input type="checkbox" checked={view.auto} onChange={(e) => setView((v) => ({ ...v, auto: e.target.checked }))} />
            <span>automatisch</span>
          </label>
          {zoom !== 1 && (
            <button className="link-btn" onClick={() => setView({ zoom: 1, auto: false })} title="Standardgröße (0)">
              100 %
            </button>
          )}
          {smallQr && (
            // Schwebt unter der Leiste, damit die eingepasste Höhe gleich bleibt
            <p className="zoom-hint" role="status">
              QR-Code bei dieser Größe klein – zum Scannen{' '}
              <button className="link-btn" onClick={() => setScan(true)}>
                QR groß anzeigen
              </button>{' '}
              (S)
            </p>
          )}
        </div>
        {errors.length > 0 && (
          <div className="demo-alert" role="status">
            Bon nicht konform:{' '}
            {errors
              .slice(0, 3)
              .map((f) => `${f.ref ? f.ref + ' ' : ''}${f.message}`)
              .join(' · ')}
          </div>
        )}
        <div className="bon-box" ref={bonRef}>
        <Receipt
          receipt={shown}
          merchant={toMerchant(merchant)}
          bon={shownBon}
          paper={80}
          moduleDots={DEFAULT_MODULE_DOTS}
          variant="demo"
          slogan={merchant.slogan}
          footer={merchant.footer}
          pending={open}
        />
        </div>
      </section>

      <div className="demo-bar">
        <span className="mono">{euro(totals.gross)}</span>
        {primary}
      </div>

      {scan && closedBon && state.closed && (
        <ScanOverlay bon={closedBon} bonNr={state.closed.bonNr} duplicate={false} onClose={() => setScan(false)} onNextBon={next} nextLabel="Nächster Kunde" />
      )}
    </main>
  );
}

function CartRow({ line, locked, onQty, onRemove }: { line: CartLine; locked: boolean; onQty: (delta: number) => void; onRemove: () => void }) {
  const p = line.position;
  const kg = p.unit === 'kg';
  return (
    <li>
      <span className="cart-text">
        <b>{p.text}</b>
        <small>
          {formatQty(p.qty)} {p.unit} × {money(Math.round(p.unitPrice * 100))} €{kg ? '/kg' : ''}
          {!p.refundable && ' · nicht erstattungsfähig'}
        </small>
      </span>
      <span className="qty">
        {!kg && (
          <>
            <button aria-label={`${p.text}: Menge verringern`} onClick={() => onQty(-1)} disabled={locked}>
              −
            </button>
            <span className="mono">{formatQty(p.qty)}</span>
            <button aria-label={`${p.text}: Menge erhöhen`} onClick={() => onQty(1)} disabled={locked || !fitsLimits(p, p.qty + 1)}>
              +
            </button>
          </>
        )}
        <button aria-label={`${p.text} entfernen`} className="rm" onClick={onRemove} disabled={locked}>
          ×
        </button>
      </span>
      <span className="mono cart-sum">{money(positionGross(p))}</span>
    </li>
  );
}
