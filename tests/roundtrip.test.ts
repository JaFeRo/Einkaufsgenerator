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

async function decode(text: string) {
  const img = matrixToRgba(encodeQr(text, 'Q'), 3);
  const [result] = await readBarcodes(img as unknown as ImageData, { formats: ['QRCode'], tryHarder: false });
  return result;
}

describe('QR-Rundlauf (erzeugen → dekodieren)', () => {
  for (const id of ['zoll61', 'special', 'kg', 'overflow']) {
    it(id, async () => {
      const { codes } = generate(SCENARIOS.find((s) => s.id === id)!.build(11));
      for (const c of codes) {
        const r = await decode(c.text);
        expect(r?.text).toBe(c.text);
        expect(r?.ecLevel).toBe('Q');
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
