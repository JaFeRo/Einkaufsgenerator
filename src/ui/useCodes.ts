import { useMemo } from 'react';
import { generate, validateCode, type CodeCheck, type EccLevel, type GeneratedCode, type Totals } from '../dakz';
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
}

export function renderBon(state: Pick<AppState, 'receipt' | 'options' | 'eccOverride'>): RenderedBon {
  const ecc: EccLevel = state.eccOverride ?? 'Q';
  const { codes, totals } = generate(state.receipt, state.options);
  let errors = 0;
  let warnings = 0;
  const rendered = codes.map((c) => {
    const check = validateCode(c.text, { limitBytes: state.options.limitBytes });
    let matrix: QrMatrix | null = null;
    let qrError: string | null = null;
    try {
      matrix = encodeQr(c.text, ecc);
    } catch (e) {
      qrError = `${(e as Error).message} (${c.bytes} Byte)`;
    }
    errors += check.findings.filter((f) => f.severity === 'error').length + (qrError ? 1 : 0);
    warnings += check.findings.filter((f) => f.severity === 'warning').length;
    return { ...c, check, matrix, qrError };
  });
  if (ecc !== 'Q') warnings += 1;
  return { codes: rendered, totals, ecc, errors, warnings };
}

export function useCodes(state: AppState): RenderedBon {
  return useMemo(() => renderBon(state), [state.receipt, state.options, state.eccOverride]);
}
