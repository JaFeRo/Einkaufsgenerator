import { useMemo } from 'react';
import { decodeBytes, generate, validateCode, type CodeCheck, type EccLevel, type GeneratedCode, type SpecVersion, type Totals } from '../dakz';
import { encodeQr, type QrMatrix } from '../qr/encode';
import type { AppState } from './state';

export interface RenderedCode extends GeneratedCode {
  check: CodeCheck;
  matrix: QrMatrix | null;
  qrError: string | null;
}

export interface RenderedBon {
  codes: RenderedCode[];
  totals: Totals;
  ecc: EccLevel;
  errors: number;
  warnings: number;
  spec: SpecVersion;
  /** Zeichen, die in ISO 8859-1 fehlen und durch „?“ ersetzt wurden */
  replaced: string[];
}

export function renderBon(state: Pick<AppState, 'receipt' | 'options' | 'eccOverride' | 'spec'>): RenderedBon {
  const ecc: EccLevel = state.eccOverride ?? 'Q';
  const spec = state.spec;
  const { codes, totals, replaced } = generate(state.receipt, { ...state.options, spec });
  let errors = 0;
  let warnings = 0;
  const rendered = codes.map((c) => {
    // Wie ein Leser: Kodierung an den tatsächlichen Bytes erkennen, nach der gewählten Fassung prüfen
    const check = validateCode(c.text, { limitBytes: state.options.limitBytes, spec, detectedCharset: decodeBytes(c.data).detected });
    let matrix: QrMatrix | null = null;
    let qrError: string | null = null;
    try {
      matrix = encodeQr(c.text, ecc, c.charset);
    } catch (e) {
      qrError = `${(e as Error).message} (${c.bytes} Byte)`;
    }
    errors += check.findings.filter((f) => f.severity === 'error').length + (qrError ? 1 : 0);
    warnings += check.findings.filter((f) => f.severity === 'warning').length;
    return { ...c, check, matrix, qrError };
  });
  if (ecc !== 'Q') warnings += 1;
  if (replaced.length) warnings += 1;
  return { codes: rendered, totals, ecc, errors, warnings, spec, replaced };
}

export function useCodes(state: AppState): RenderedBon {
  return useMemo(() => renderBon(state), [state.receipt, state.options, state.eccOverride, state.spec]);
}
