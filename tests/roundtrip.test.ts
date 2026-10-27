import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import { SCENARIOS, generate } from '../src/dakz';
import { QrCapacityError, encodeQr, matrixToRgba } from '../src/qr/encode';

const require = createRequire(import.meta.url);

beforeAll(async () => {
  const wasm = require.resolve('zxing-wasm/reader/zxing_reader.wasm');
  const bin = readFileSync(wasm);
  await prepareZXingModule({ overrides: { wasmBinary: bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) }, fireImmediately: true });
});

async function decode(text: string, charset: 'utf-8' | 'iso-8859-1' = 'utf-8') {
  const img = matrixToRgba(encodeQr(text, 'Q', charset), 3);
  const [result] = await readBarcodes(img as unknown as ImageData, { formats: ['QRCode'], tryHarder: false });
  return result;
}

describe('QR-Rundlauf (erzeugen → dekodieren)', () => {
  for (const id of ['zoll61', 'special', 'kg', 'overflow']) {
    it(id, async () => {
      for (const spec of ['1.2', '1.3'] as const) {
        const { codes } = generate(SCENARIOS.find((s) => s.id === id)!.build(11), { spec });
        for (const c of codes) {
          const r = await decode(c.text, c.charset);
          // Bytes vergleichen: 1.2 schreibt UTF-8, 1.3 ISO 8859-1
          expect(Array.from(r!.bytes), `${id} ${spec}`).toEqual(Array.from(c.data));
          expect(r?.ecLevel).toBe('Q');
        }
      }
    });
  }

  it('wählt die kleinste Version', () => {
    expect(encodeQr('K;1', 'Q').version).toBe(1);
  });

  it('meldet zu große Inhalte', () => {
    expect(() => encodeQr('x'.repeat(1664), 'Q')).toThrow(QrCapacityError);
    expect(encodeQr('x'.repeat(1663), 'Q').version).toBe(40);
  });
});
