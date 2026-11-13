import { CATALOG, generate, type Position, type Receipt, type SpecVersion } from '../dakz';
import { encodeQr, type QrMatrix } from '../qr/encode';

/**
 * Schritte des Scan-Tests: zuerst ein einfacher QR-Code ohne dAKZ-Inhalt (Funktionstest der Kamera),
 * dann gültige dAKZ-Bons, deren QR-Version schrittweise steigt. So lässt sich mit einem Gerät
 * eingrenzen, ob es gar keinen Code erkennt oder erst ab einer bestimmten Dichte scheitert.
 */
export interface ScanTestStep {
  label: string;
  /** Erklärung, was der Schritt prüft */
  hint: string;
  matrix: QrMatrix;
  /** BON_NR bei dAKZ-Schritten */
  bonNr?: string;
  /** Inhalt des Codes */
  text: string;
  bytes: number;
}

/** Zielversionen der dAKZ-Schritte; Version 10 ist mit Fehlerkorrektur Q der kleinste gültige Bon. */
export const SCAN_TEST_VERSIONS = [10, 13, 16, 20, 25, 30];

const position = (i: number): Position => {
  const item = CATALOG.at(i % CATALOG.length)!;
  return { text: item.text, vat: item.vat, unitPrice: item.price, qty: item.unit === 'kg' ? 0.5 : 1, unit: item.unit ?? 'Stück', refundable: true };
};

function receipt(bonNr: string, count: number, now: number): Receipt {
  const start = Math.floor(now / 1000);
  // Ein teurer Artikel zuerst, damit auch der kleinste Bon über 50,00 € liegt
  const positions = [{ ...position(0) }, ...Array.from({ length: count - 1 }, (_, i) => position(i + 1))];
  return { bonNr, start, end: start + 12, tseSignature: 'MEUCIQDTestTestTestTestTestTestTestTestTest=', tsePublicKey: 'BHTestTestTestTestTestTestTestTestTestTestTest=', externalRef: `REF_${bonNr}`, positions };
}

/** Kleinster Bon (Anzahl Positionen), dessen Code mindestens die Zielversion erreicht und in einen Code passt. */
function bonForVersion(target: number, spec: SpecVersion, bonNr: string, now: number) {
  for (let n = 1; n <= 200; n++) {
    const r = receipt(bonNr, n, now);
    const codes = generate(r, { spec }).codes;
    if (codes.length > 1) return null;
    const m = encodeQr(codes[0].text, 'Q', codes[0].charset);
    if (m.version >= target) return { matrix: m, positions: n, bytes: codes[0].bytes, text: codes[0].text };
  }
  return null;
}

export function buildScanTest(spec: SpecVersion, takeBonNr: () => string, now = Date.now()): ScanTestStep[] {
  const plain = encodeQr('TEST', 'M');
  const steps: ScanTestStep[] = [
    {
      label: 'Funktionstest',
      hint: 'Einfacher QR-Code mit dem Text „TEST“, kein dAKZ-Inhalt. Die App sollte zumindest melden, dass ein Code erkannt wurde.',
      matrix: plain,
      text: 'TEST',
      bytes: 4
    }
  ];
  for (const target of SCAN_TEST_VERSIONS) {
    const bonNr = takeBonNr();
    const hit = bonForVersion(target, spec, bonNr, now);
    if (!hit) continue;
    steps.push({
      label: `dAKZ-Bon, QR-Version ${hit.matrix.version}`,
      hint: `Gültiger Bon nach Fassung ${spec} mit ${hit.positions} Position${hit.positions > 1 ? 'en' : ''} (${hit.bytes} Byte, Fehlerkorrektur Q).`,
      matrix: hit.matrix,
      bonNr,
      text: hit.text,
      bytes: hit.bytes
    });
  }
  return steps;
}

/**
 * Bildpunkte je Modul für die Bildschirmanzeige: ganzzahlig in Gerätepixeln, damit jedes Modul gleich
 * breit ist. Gebrochene Werte (z. B. 2,1 px) ergeben abwechselnd 2 und 3 Pixel breite Module und Moiré im Kamerabild.
 */
export function snapModulePx(availableCssPx: number, totalModules: number, dpr: number, maxCssPx = Infinity): number {
  const device = Math.floor((Math.min(availableCssPx, maxCssPx) * dpr) / totalModules);
  return Math.max(1, device) / dpr;
}
