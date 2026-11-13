import { CODE_PAGES, type CodePage } from '../print/escpos';
import { testJob } from '../print/receiptJob';
import { BAUD_RATES, WIDTH_CHOICES, connect, disconnect, effectiveWidth, printSettings, send, setPrefs, usePrinter } from '../print/usePrinter';
import { serialSupported, usbSupported } from '../print/transport';

interface Props {
  paper: 80 | 58;
  moduleDots: number;
  /** Druckt den aktuellen Bon; gibt zurück, ob er angekommen ist */
  onPrintBon: () => Promise<boolean>;
  notify: (m: string) => void;
}

/** Bondrucker direkt aus dem Browser ansprechen (ESC/POS über WebUSB oder Web Serial). */
export function PrinterPanel({ paper, moduleDots, onPrintBon, notify }: Props) {
  const { printer, prefs, busy, error } = usePrinter();
  const usb = usbSupported();
  const serial = serialSupported();
  const width = effectiveWidth(prefs, paper);

  if (!usb && !serial)
    return (
      <p className="hint" id="printer-unsupported">
        Direkt drucken geht nur in Chrome oder Edge am Computer (WebUSB, Web Serial). In diesem Browser bleibt „Drucken“ über den Druckdialog.
      </p>
    );

  const test = async () => {
    if (await send(() => testJob(printSettings(prefs, paper), moduleDots), 'Testdruck')) notify('Testdruck gesendet');
  };
  const bon = async () => {
    if (await onPrintBon()) notify('Bon an den Drucker gesendet');
  };

  return (
    <div className="printer" id="printer">
      <div className="row">
        <span className="hint">Bondrucker</span>
        <span className={`pill ${printer ? 'ok' : error ? 'err' : 'neutral'}`} id="printer-status">
          {busy ?? (printer ? printer.label : prefs.kind ? `getrennt · zuletzt ${prefs.kind === 'usb' ? 'USB' : 'seriell'}` : 'nicht verbunden')}
        </span>
      </div>
      <div className="row">
        {usb && (
          <button className="btn" onClick={() => connect('usb')} disabled={!!busy} title="Bekannter Drucker (1FC9:2016) und alle Geräte der USB-Druckerklasse">
            USB verbinden
          </button>
        )}
        {serial && (
          <button className="btn" onClick={() => connect('serial')} disabled={!!busy} title={`Serieller Anschluss mit ${prefs.baud} Baud`}>
            Seriell verbinden
          </button>
        )}
        {printer && (
          <button className="link-btn" onClick={disconnect} disabled={!!busy}>
            Trennen
          </button>
        )}
      </div>
      <div className="row">
        <button className="btn" onClick={test} disabled={!!busy}>
          Testdruck
        </button>
        <button className="btn primary" onClick={bon} disabled={!!busy}>
          Bon drucken
        </button>
      </div>
      {error && (
        <p className="hint" role="alert" style={{ color: 'var(--err)' }}>
          {error}
        </p>
      )}
      <details className="printer-settings">
        <summary>Druckereinstellungen</summary>
        <div className="row">
          <label className="field">
            Druckbreite
            <select value={prefs.widthDots} onChange={(e) => setPrefs({ widthDots: Number(e.target.value) })}>
              {WIDTH_CHOICES.map((w) => (
                <option key={w} value={w}>
                  {w === 0 ? `wie Papier (${paper === 58 ? 384 : 576} Punkte)` : `${w} Punkte`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Zeichentabelle
            <select value={prefs.codePage} onChange={(e) => setPrefs({ codePage: e.target.value as CodePage })}>
              {CODE_PAGES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            QR-Code
            <select value={prefs.qrMode} onChange={(e) => setPrefs({ qrMode: e.target.value as 'raster' | 'native' })}>
              <option value="raster">als Rasterbild (Standard)</option>
              <option value="native">als Druckerbefehl (GS ( k)</option>
            </select>
          </label>
          {serial && (
            <label className="field">
              Baudrate (seriell)
              <select value={prefs.baud} onChange={(e) => setPrefs({ baud: Number(e.target.value) })}>
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label className="check">
          <input type="checkbox" checked={prefs.cut} onChange={(e) => setPrefs({ cut: e.target.checked })} />
          <span>Am Ende schneiden</span>
        </label>
        {usb && (
          <p className="hint">
            Drucker nicht in der Liste?{' '}
            <button className="link-btn" onClick={() => connect('usb', true)} disabled={!!busy}>
              Alle USB-Geräte zeigen
            </button>
          </p>
        )}
        <p className="hint">
          {Math.floor(width / 12)} Zeichen je Zeile. Der Bon geht als ESC/POS-Befehle an den Drucker, die QR-Codes mit genau den Bytes der gewählten Fassung (1.3: ISO 8859-1) und{' '}
          {moduleDots} Punkten je Modul, soweit die Breite reicht. Stimmen Umlaute im Text nicht, die Zeichentabelle wechseln; den QR-Code betrifft das nicht. Unter Windows belegt der
          Druckertreiber den USB-Anschluss: dann den seriellen Weg nehmen oder den WinUSB-Treiber (Zadig) installieren.
        </p>
      </details>
    </div>
  );
}
