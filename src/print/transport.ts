/**
 * Verbindung zum Bondrucker direkt aus dem Browser (Chrome, Edge): WebUSB wie pyusb im Skript der
 * Entwicklung, oder Web Serial für Drucker an einem USB-Seriell-Adapter. Es läuft nichts auf einem Server.
 */

// Nur die Teile von WebUSB und Web Serial, die hier gebraucht werden (nicht in lib.dom enthalten)
interface UsbEndpoint {
  endpointNumber: number;
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
}
interface UsbAlternate {
  alternateSetting: number;
  interfaceClass: number;
  endpoints: UsbEndpoint[];
}
interface UsbInterface {
  interfaceNumber: number;
  alternates: UsbAlternate[];
}
interface UsbDevice {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  opened: boolean;
  configuration: { interfaces: UsbInterface[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  selectAlternateInterface(n: number, alt: number): Promise<void>;
  transferOut(endpoint: number, data: BufferSource): Promise<{ status: string; bytesWritten: number }>;
}
interface UsbApi {
  requestDevice(o: { filters: { vendorId?: number; productId?: number; classCode?: number }[] }): Promise<UsbDevice>;
  getDevices(): Promise<UsbDevice[]>;
}
interface SerialPortLike {
  open(o: { baudRate: number; flowControl?: 'none' | 'hardware' }): Promise<void>;
  close(): Promise<void>;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialApi {
  requestPort(o?: object): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

const nav = () => navigator as Navigator & { usb?: UsbApi; serial?: SerialApi };
export const usbSupported = () => !!nav().usb;
export const serialSupported = () => !!nav().serial;

/** Kennung aus dem Skript der Entwicklung (VENDOR_ID 0x1FC9, PRODUCT_ID 0x2016) */
export const KNOWN_PRINTER = { vendorId: 0x1fc9, productId: 0x2016 };
/** USB-Geräteklasse „Drucker“ */
const PRINTER_CLASS = 7;

export interface Printer {
  kind: 'usb' | 'serial';
  label: string;
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

const hex = (n: number) => n.toString(16).toUpperCase().padStart(4, '0');

/** Schreibt in Stücken, damit auch kleine Puffer (USB-Seriell-Adapter, ältere Drucker) mitkommen. */
async function chunked(data: Uint8Array, size: number, write: (part: Uint8Array) => Promise<void>) {
  for (let i = 0; i < data.length; i += size) await write(data.subarray(i, i + size));
}

async function openUsb(dev: UsbDevice): Promise<Printer> {
  if (!dev.opened) await dev.open();
  if (!dev.configuration) await dev.selectConfiguration(1);
  // Die Schnittstelle mit einem Bulk-OUT-Endpunkt suchen (im Skript out_ep=0x01); Druckerklasse bevorzugt
  const candidates = (dev.configuration?.interfaces ?? []).flatMap((i) =>
    i.alternates.map((a) => ({ i, a, out: a.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk') }))
  );
  const pick = candidates.find((c) => c.out && c.a.interfaceClass === PRINTER_CLASS) ?? candidates.find((c) => c.out);
  if (!pick?.out) throw new Error('Das Gerät hat keinen Ausgang für Druckdaten (Bulk-OUT).');
  try {
    await dev.claimInterface(pick.i.interfaceNumber);
  } catch {
    throw new Error(
      'Die USB-Schnittstelle ist belegt. Unter Windows hält meist der Druckertreiber sie fest (dann WinUSB-Treiber nötig), sonst ein anderes Programm oder Tab.'
    );
  }
  if (pick.a.alternateSetting) await dev.selectAlternateInterface(pick.i.interfaceNumber, pick.a.alternateSetting);
  const ep = pick.out.endpointNumber;
  const name = [dev.manufacturerName, dev.productName].filter(Boolean).join(' ') || 'USB-Drucker';
  return {
    kind: 'usb',
    label: `${name} (USB ${hex(dev.vendorId)}:${hex(dev.productId)})`,
    write: (data) =>
      chunked(data, 4096, async (part) => {
        const r = await dev.transferOut(ep, part as Uint8Array<ArrayBuffer>);
        if (r.status !== 'ok') throw new Error(`USB-Übertragung fehlgeschlagen (${r.status})`);
      }),
    close: () => dev.close()
  };
}

async function openSerial(port: SerialPortLike, baudRate: number): Promise<Printer> {
  await port.open({ baudRate });
  const info = port.getInfo();
  return {
    kind: 'serial',
    label: `Serieller Drucker, ${baudRate} Baud${info.usbVendorId ? ` (Adapter ${hex(info.usbVendorId)}:${hex(info.usbProductId ?? 0)})` : ''}`,
    write: async (data) => {
      const w = port.writable!.getWriter();
      try {
        await chunked(data, 1024, (part) => w.write(part));
      } finally {
        w.releaseLock();
      }
    },
    close: () => port.close()
  };
}

/** Auswahl im Browser-Dialog: der bekannte Drucker, jedes Gerät der Druckerklasse, auf Wunsch jedes Gerät. */
export async function connectUsb(anyDevice: boolean): Promise<Printer> {
  const usb = nav().usb;
  if (!usb) throw new Error('WebUSB fehlt: bitte Chrome oder Edge verwenden.');
  const dev = await usb.requestDevice({ filters: anyDevice ? [] : [KNOWN_PRINTER, { classCode: PRINTER_CLASS }] });
  return openUsb(dev);
}

export async function connectSerial(baudRate: number): Promise<Printer> {
  const serial = nav().serial;
  if (!serial) throw new Error('Web Serial fehlt: bitte Chrome oder Edge verwenden.');
  return openSerial(await serial.requestPort(), baudRate);
}

/** Schon freigegebenes Gerät ohne Dialog wieder verbinden (nach dem Neuladen). */
export async function reconnect(kind: 'usb' | 'serial', baudRate: number): Promise<Printer | null> {
  try {
    if (kind === 'usb') {
      const devs = (await nav().usb?.getDevices()) ?? [];
      const dev = devs.find((d) => d.vendorId === KNOWN_PRINTER.vendorId && d.productId === KNOWN_PRINTER.productId) ?? devs.at(0);
      return dev ? await openUsb(dev) : null;
    }
    const port = ((await nav().serial?.getPorts()) ?? []).at(0);
    return port ? await openSerial(port, baudRate) : null;
  } catch {
    return null;
  }
}
