import { useSyncExternalStore } from 'react';
import { KEYS, loadJson, saveJson } from '../ui/storage';
import { CODE_PAGES, type CodePage } from './escpos';
import { DEFAULT_PRINT, type PrintSettings, type QrMode } from './receiptJob';
import { connectSerial, connectUsb, reconnect, type Printer } from './transport';

/**
 * Eine Druckerverbindung für die ganze Seite (Werkbank und Demo teilen sie).
 * Gespeichert wird nur die Einstellung, nicht das Gerät: der Browser merkt sich die Freigabe selbst.
 */
export interface PrinterPrefs {
  /** Zuletzt verwendeter Anschluss; darüber wird nach dem Neuladen ohne Dialog neu verbunden */
  kind: 'usb' | 'serial' | null;
  baud: number;
  /** 0 = nach Papierbreite (80 mm → 576, 58 mm → 384 Punkte) */
  widthDots: number;
  codePage: CodePage;
  qrMode: QrMode;
  cut: boolean;
}

export const DEFAULT_PREFS: PrinterPrefs = { kind: null, baud: 19200, widthDots: 0, codePage: DEFAULT_PRINT.codePage, qrMode: DEFAULT_PRINT.qrMode, cut: true };
export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200];
export const WIDTH_CHOICES = [0, 576, 512, 432, 384];

function sanitize(x: Partial<PrinterPrefs> | null): PrinterPrefs {
  const p = { ...DEFAULT_PREFS, ...(x && typeof x === 'object' ? x : {}) };
  return {
    kind: p.kind === 'usb' || p.kind === 'serial' ? p.kind : null,
    baud: BAUD_RATES.includes(p.baud) ? p.baud : DEFAULT_PREFS.baud,
    widthDots: WIDTH_CHOICES.includes(p.widthDots) ? p.widthDots : 0,
    codePage: CODE_PAGES.some((c) => c.id === p.codePage) ? p.codePage : DEFAULT_PREFS.codePage,
    qrMode: p.qrMode === 'native' ? 'native' : 'raster',
    cut: p.cut !== false
  };
}

interface Snapshot {
  printer: Printer | null;
  prefs: PrinterPrefs;
  busy: string | null;
  error: string | null;
}

let snap: Snapshot = { printer: null, prefs: sanitize(loadJson<Partial<PrinterPrefs> | null>(KEYS.printer, null)), busy: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<Snapshot>) => {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
};

export function setPrefs(patch: Partial<PrinterPrefs>) {
  const prefs = sanitize({ ...snap.prefs, ...patch });
  saveJson(KEYS.printer, prefs);
  set({ prefs });
}

export const effectiveWidth = (prefs: PrinterPrefs, paper: 80 | 58) => prefs.widthDots || (paper === 58 ? 384 : 576);
export const printSettings = (prefs: PrinterPrefs, paper: 80 | 58): PrintSettings => ({
  widthDots: effectiveWidth(prefs, paper),
  codePage: prefs.codePage,
  qrMode: prefs.qrMode,
  cut: prefs.cut
});

const message = (e: unknown) => {
  const name = (e as { name?: string })?.name;
  // Dialog geschlossen, ohne ein Gerät zu wählen
  if (name === 'NotFoundError' && /select|chosen|No device/i.test(String((e as Error).message))) return null;
  if (name === 'NotFoundError') return 'Kein Gerät gewählt.';
  if (name === 'SecurityError') return 'Der Browser hat den Zugriff verweigert (Seite muss über HTTPS laufen, Berechtigung prüfen).';
  if (name === 'NetworkError') return 'Verbindung zum Gerät unterbrochen. Kabel prüfen und neu verbinden.';
  if (name === 'InvalidStateError') return 'Der Anschluss ist schon offen, vermutlich in einem anderen Tab. Dort trennen oder den Tab schließen.';
  return e instanceof Error ? e.message : String(e);
};

async function drop() {
  const p = snap.printer;
  set({ printer: null });
  await p?.close().catch(() => undefined);
}

export async function connect(kind: 'usb' | 'serial', anyDevice = false) {
  set({ busy: 'Verbinde …', error: null });
  try {
    await drop();
    const printer = kind === 'usb' ? await connectUsb(anyDevice) : await connectSerial(snap.prefs.baud);
    setPrefs({ kind });
    set({ printer, busy: null });
  } catch (e) {
    set({ busy: null, error: message(e) });
  }
}

export async function disconnect() {
  await drop();
  set({ error: null });
}

/** Sendet einen Auftrag; ohne offene Verbindung erst still mit dem zuletzt freigegebenen Gerät verbinden. */
export async function send(job: () => Uint8Array, label: string): Promise<boolean> {
  if (snap.busy) return false;
  set({ busy: `${label} …`, error: null });
  try {
    let printer = snap.printer;
    if (!printer && snap.prefs.kind) printer = await reconnect(snap.prefs.kind, snap.prefs.baud);
    if (!printer) throw new Error('Kein Drucker verbunden. Bitte zuerst über USB oder seriell verbinden.');
    set({ printer });
    await printer.write(job());
    set({ busy: null });
    return true;
  } catch (e) {
    // Nach einem Fehler neu öffnen statt mit einer halb toten Verbindung weiterzumachen
    await drop();
    set({ busy: null, error: message(e) ?? 'Druck abgebrochen.' });
    return false;
  }
}

/** Letzte Fehlermeldung, auch außerhalb von React lesbar */
export const printerError = () => snap.error;

export function usePrinter(): Snapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snap
  );
}
