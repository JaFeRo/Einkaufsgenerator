import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { DEFAULT_OPTIONS, MERCHANT, SCENARIOS } from '../src/dakz';
import { EscPos, encodeText, rasterDots } from '../src/print/escpos';
import { receiptJob, testJob, twoColumns, wrap, type PrintSettings } from '../src/print/receiptJob';
import { connectUsb, connectSerial } from '../src/print/transport';
import { encodeQr } from '../src/qr/encode';
import { renderBon } from '../src/ui/useCodes';

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const bin = readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'));
  await prepareZXingModule({ overrides: { wasmBinary: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) }, fireImmediately: true });
});

interface Raster {
  width: number;
  height: number;
  bits: Uint8Array;
  /** Byte-Position nach dem letzten Streifen */
  end: number;
}
interface Parsed {
  text: number[];
  rasters: Raster[];
  native: { model?: number; size?: number; ecc?: number; data: number[][]; printed: number };
  codePage?: number;
  cuts: number;
}

/** Kleiner ESC/POS-Leser: kennt genau die Befehle, die der Simulator sendet, und scheitert an allem anderen. */
function parse(b: Uint8Array): Parsed {
  const out: Parsed = { text: [], rasters: [], native: { data: [], printed: 0 }, cuts: 0 };
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (c === 0x1b) {
      const cmd = b[i + 1];
      if (cmd === 0x40) i += 2;
      else if (cmd === 0x74) (out.codePage = b[i + 2]), (i += 3);
      else if (cmd === 0x61 || cmd === 0x45 || cmd === 0x64) i += 3;
      else throw new Error(`ESC ${cmd.toString(16)} an ${i}`);
    } else if (c === 0x1c) {
      if (b[i + 1] !== 0x2e) throw new Error(`FS ${b[i + 1]} an ${i}`);
      i += 2;
    } else if (c === 0x1d) {
      const cmd = b[i + 1];
      if (cmd === 0x21) i += 3;
      else if (cmd === 0x56) {
        expect(b[i + 2]).toBe(66);
        out.cuts++;
        i += 4;
      } else if (cmd === 0x76) {
        expect([b[i + 2], b[i + 3]]).toEqual([0x30, 0]);
        const wb = b[i + 4] | (b[i + 5] << 8);
        const h = b[i + 6] | (b[i + 7] << 8);
        expect(h).toBeLessThanOrEqual(960);
        const data = b.subarray(i + 8, i + 8 + wb * h);
        expect(data.length).toBe(wb * h);
        const prev = out.rasters.at(-1);
        // Streifen eines Bildes folgen ohne Bytes dazwischen
        if (prev && prev.end === i && prev.width === wb * 8) {
          const bits = new Uint8Array(prev.bits.length + data.length);
          bits.set(prev.bits);
          bits.set(data, prev.bits.length);
          prev.bits = bits;
          prev.height += h;
        } else out.rasters.push({ width: wb * 8, height: h, bits: data.slice(), end: 0 });
        i += 8 + wb * h;
        out.rasters.at(-1)!.end = i;
      } else if (cmd === 0x28 && b[i + 2] === 0x6b) {
        const len = b[i + 3] | (b[i + 4] << 8);
        const body = b.subarray(i + 5, i + 5 + len);
        expect(body[0]).toBe(0x31);
        const fn = body[1];
        if (fn === 0x41) out.native.model = body[2];
        else if (fn === 0x43) out.native.size = body[2];
        else if (fn === 0x45) out.native.ecc = body[2];
        else if (fn === 0x50) {
          expect(body[2]).toBe(0x30);
          out.native.data.push(Array.from(body.subarray(3)));
        } else if (fn === 0x51) out.native.printed++;
        else throw new Error(`GS ( k fn ${fn}`);
        i += 5 + len;
      } else throw new Error(`GS ${cmd.toString(16)} an ${i}`);
    } else {
      out.text.push(c);
      i++;
    }
  }
  return out;
}

async function decodeRaster(r: Raster) {
  const rgba = new Uint8ClampedArray(r.width * r.height * 4);
  const wb = r.width / 8;
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const dark = (r.bits[y * wb + (x >> 3)] >> (7 - (x & 7))) & 1;
      const o = (y * r.width + x) * 4;
      rgba[o] = rgba[o + 1] = rgba[o + 2] = dark ? 0 : 255;
      rgba[o + 3] = 255;
    }
  const [res] = await readBarcodes({ data: rgba, width: r.width, height: r.height } as unknown as ImageData, { formats: ['QRCode'], tryHarder: true });
  return res;
}

const settings = (p: Partial<PrintSettings> = {}): PrintSettings => ({ widthDots: 576, codePage: 'pc850', qrMode: 'raster', cut: true, ...p });
const bonFor = (id: string, spec: '1.2' | '1.3') => {
  const receipt = SCENARIOS.find((s) => s.id === id)!.build(7);
  return { receipt, bon: renderBon({ receipt, options: DEFAULT_OPTIONS, eccOverride: null, spec }) };
};

describe('ESC/POS-Bon', () => {
  for (const spec of ['1.2', '1.3'] as const)
    for (const id of ['zoll61', 'special', 'overflow'])
      it(`${id} ${spec}: gedruckte QR-Codes enthalten exakt die Bytes`, async () => {
        const { receipt, bon } = bonFor(id, spec);
        const p = parse(receiptJob({ receipt, merchant: MERCHANT, bon, moduleDots: 4, settings: settings() }));
        expect(p.rasters).toHaveLength(bon.codes.length);
        expect(p.cuts).toBe(1);
        expect(p.codePage).toBe(2);
        for (const [k, c] of bon.codes.entries()) {
          const r = p.rasters[k];
          expect(r.width).toBe(576);
          const res = await decodeRaster(r);
          expect(res, `QR ${c.index}`).toBeTruthy();
          expect(Array.from(res!.bytes)).toEqual(Array.from(c.data));
          expect(res!.ecLevel).toBe('Q');
        }
      });

  it('58 mm: Codes schrumpfen auf die Druckbreite und bleiben lesbar', async () => {
    const { receipt, bon } = bonFor('overflow', '1.3');
    const p = parse(receiptJob({ receipt, merchant: MERCHANT, bon, moduleDots: 6, settings: settings({ widthDots: 384 }) }));
    for (const [k, c] of bon.codes.entries()) {
      expect(p.rasters[k].width).toBe(384);
      const dots = rasterDots(c.matrix!, 6, 384);
      expect(p.rasters[k].height).toBe((c.matrix!.size + 8) * dots);
      expect(Array.from((await decodeRaster(p.rasters[k]))!.bytes)).toEqual(Array.from(c.data));
    }
  });

  it('Druckerbefehl GS ( k: Bytes unverändert, ECC Q, Modulgröße', () => {
    const { receipt, bon } = bonFor('zoll61', '1.3');
    const p = parse(receiptJob({ receipt, merchant: MERCHANT, bon, moduleDots: 4, settings: settings({ qrMode: 'native', cut: false }) }));
    expect(p.rasters).toHaveLength(0);
    expect(p.cuts).toBe(0);
    expect(p.native).toMatchObject({ model: 0x32, size: 4, ecc: 50, printed: bon.codes.length });
    expect(p.native.data).toEqual(bon.codes.map((c) => Array.from(c.data)));
  });

  it('Textzeilen passen in die Zeichenbreite', () => {
    const { receipt, bon } = bonFor('special', '1.2');
    for (const w of [576, 384]) {
      const p = parse(receiptJob({ receipt, merchant: MERCHANT, bon, moduleDots: 4, settings: settings({ widthDots: w }) }));
      const lines = String.fromCharCode(...p.text).split('\n');
      for (const l of lines) expect(l.length, l).toBeLessThanOrEqual(w / 12);
      expect(lines.join('\n')).toContain('TESTBELEG');
    }
    for (const w of [576, 384]) for (const l of String.fromCharCode(...parse(testJob(settings({ widthDots: w }), 4)).text).split('\n')) expect(l.length, l).toBeLessThanOrEqual(w / 12);
  });

  it('Testseite: beide Codes lesbar, „Stück“ in ISO 8859-1', async () => {
    const p = parse(testJob(settings(), 4));
    expect(p.rasters).toHaveLength(2);
    expect((await decodeRaster(p.rasters[0]))!.text).toBe('TEST');
    const second = await decodeRaster(p.rasters[1]);
    expect(Array.from(second!.bytes)).toContain(0xfc);
  });
});

describe('Zeichentabellen', () => {
  it('PC850, PC858, Windows-1252, ASCII', () => {
    expect(encodeText('äöüß€', 'pc850')).toEqual([0x84, 0x94, 0x81, 0xe1, 0x45, 0x55, 0x52]);
    expect(encodeText('Ä€', 'pc858')).toEqual([0x8e, 0xd5]);
    expect(encodeText('Ä€–', 'wpc1252')).toEqual([0xc4, 0x80, 0x2d]);
    expect(String.fromCharCode(...encodeText('Größe – 3×', 'ascii'))).toBe('Groesse - 3x');
  });

  it('ESC t je Tabelle, ohne bei ASCII', () => {
    expect(parse(new EscPos('wpc1252').init().build()).codePage).toBe(16);
    expect(parse(new EscPos('pc858').init().build()).codePage).toBe(19);
    expect(parse(new EscPos('ascii').init().build()).codePage).toBeUndefined();
  });
});

describe('Zeilenumbruch', () => {
  it('Betrag rechtsbündig, lange Texte umbrechen', () => {
    expect(twoColumns('Brot', '2,50 A', 20)).toEqual(['Brot          2,50 A']);
    const l = twoColumns('Sehr langer Artikeltext mit vielen Wörtern', '12,99 A', 24);
    expect(l.every((x) => x.length <= 24)).toBe(true);
    expect(l.at(-1)!.endsWith('12,99 A')).toBe(true);
    expect(wrap('x'.repeat(30), 12).every((x) => x.length <= 12)).toBe(true);
  });

  it('Raster größer als 960 Zeilen wird in Streifen geteilt', () => {
    const m = encodeQr('x'.repeat(1600), 'Q');
    const b = new EscPos('pc850').qrRaster(m, 6, 1200).build();
    const heads = b.reduce((n, x, i) => n + (x === 0x1d && b[i + 1] === 0x76 && b[i + 2] === 0x30 ? 1 : 0), 0);
    expect(heads).toBe(Math.ceil(((m.size + 8) * 6) / 960));
  });
});

describe('Übertragung', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('WebUSB: Druckerschnittstelle, Bulk-OUT, Stücke', async () => {
    const sent: number[][] = [];
    const dev = {
      vendorId: 0x1fc9,
      productId: 0x2016,
      productName: 'POS80',
      opened: false,
      configuration: null as unknown,
      open: vi.fn(async () => void (dev.opened = true)),
      close: vi.fn(async () => undefined),
      selectConfiguration: vi.fn(async () => {
        dev.configuration = {
          interfaces: [
            { interfaceNumber: 0, alternates: [{ alternateSetting: 0, interfaceClass: 3, endpoints: [{ endpointNumber: 3, direction: 'out', type: 'interrupt' }] }] },
            {
              interfaceNumber: 1,
              alternates: [{ alternateSetting: 0, interfaceClass: 7, endpoints: [{ endpointNumber: 2, direction: 'in', type: 'bulk' }, { endpointNumber: 1, direction: 'out', type: 'bulk' }] }]
            }
          ]
        };
      }),
      claimInterface: vi.fn(async () => undefined),
      selectAlternateInterface: vi.fn(async () => undefined),
      transferOut: vi.fn(async (ep: number, d: Uint8Array) => {
        sent.push([ep, d.length]);
        return { status: 'ok', bytesWritten: d.length };
      })
    };
    const requestDevice = vi.fn(async () => dev);
    vi.stubGlobal('navigator', { usb: { requestDevice, getDevices: async () => [dev] } });
    const p = await connectUsb(false);
    expect((requestDevice.mock.calls[0] as unknown as [{ filters: unknown }])[0].filters).toEqual([{ vendorId: 0x1fc9, productId: 0x2016 }, { classCode: 7 }]);
    expect(dev.claimInterface).toHaveBeenCalledWith(1);
    expect(p.label).toContain('1FC9:2016');
    await p.write(new Uint8Array(10000));
    expect(sent).toEqual([
      [1, 4096],
      [1, 4096],
      [1, 1808]
    ]);
  });

  it('Web Serial: Baudrate und vollständige Daten', async () => {
    const got: number[] = [];
    const port = {
      open: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      getInfo: () => ({}),
      writable: new WritableStream<Uint8Array>({ write: (c) => void got.push(...c) })
    };
    vi.stubGlobal('navigator', { serial: { requestPort: async () => port, getPorts: async () => [port] } });
    const p = await connectSerial(19200);
    expect(port.open).toHaveBeenCalledWith({ baudRate: 19200 });
    const data = Uint8Array.from({ length: 3000 }, (_, i) => i & 0xff);
    await p.write(data);
    await p.write(data);
    expect(got).toEqual([...data, ...data]);
  });
});
