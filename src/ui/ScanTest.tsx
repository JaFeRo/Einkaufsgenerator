import { useEffect, useState } from 'react';
import { QUIET_MODULES } from '../qr/layout';
import type { SpecVersion } from '../dakz';
import { QrSvg } from './QrSvg';
import { buildScanTest, snapModulePx } from './scanTest';
import { useViewport } from './useViewport';

interface Props {
  spec: SpecVersion;
  takeBonNr: () => string;
  onClose: () => void;
}

/** Platz für Kopf- und Fußleiste des Overlays */
const BARS_PX = 190;

/**
 * Scan-Test für Geräte, die vom Bildschirm keinen Code erkennen: Schritt für Schritt größere Codes,
 * jeweils bildschirmfüllend mit ganzzahligen Bildpunkten je Modul.
 * Pfeiltasten: Schritte · Esc: schließen
 */
export function ScanTest({ spec, takeBonNr, onClose }: Props) {
  // Einmal beim Öffnen: jede Stufe bekommt eine eigene BON_NR, damit die App keine Duplikate meldet
  const [steps] = useState(() => buildScanTest(spec, takeBonNr));
  const [i, setI] = useState(0);
  const { width, height, dpr } = useViewport();
  const step = steps.at(Math.min(i, steps.length - 1))!;
  const total = step.matrix.size + QUIET_MODULES * 2;
  const modulePx = snapModulePx(Math.min(width - 32, height - BARS_PX), total, dpr);
  const side = modulePx * total;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [steps.length, onClose]);

  return (
    <div className="scan scan-test" role="dialog" aria-modal="true" aria-label="Scan-Test">
      <div className="bar-top">
        <span>
          Scan-Test · Schritt {i + 1} von {steps.length}: <b>{step.label}</b>
          {step.bonNr && <span className="scan-nr"> · Bon {step.bonNr}</span>}
        </span>
        <button onClick={onClose}>Schließen</button>
      </div>
      <div className="qr-big">
        <QrSvg matrix={step.matrix} label={`${step.label}, QR-Version ${step.matrix.version}`} style={{ width: side, height: side }} />
      </div>
      <div className="bar-bottom scan-test-info">
        <p className="scan-test-hint">
          {step.hint} Version {step.matrix.version}, {step.matrix.size} × {step.matrix.size} Module, {Number((modulePx * dpr).toFixed(2))} Bildpunkte je Modul.
        </p>
        <div className="scan-test-nav">
          <button onClick={() => setI(i - 1)} disabled={i === 0}>
            ← Vorheriger Schritt
          </button>
          <button onClick={() => setI(i + 1)} disabled={i === steps.length - 1}>
            Nächster Schritt →
          </button>
        </div>
      </div>
    </div>
  );
}
