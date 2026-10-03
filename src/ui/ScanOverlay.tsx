import { useEffect, useState } from 'react';
import { QrSvg } from './QrSvg';
import type { RenderedBon } from './useCodes';

/** Bildschirmfüllende Anzeige zum Scannen vom Monitor. Pfeiltasten wechseln, Leertaste = nächster Bon. */
export function ScanOverlay({ bon, bonNr, onClose, onNextBon }: { bon: RenderedBon; bonNr: string; onClose: () => void; onNextBon: () => void }) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, bon.codes.length - 1);
  const c = bon.codes[idx];

  useEffect(() => setI(0), [bonNr]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, bon.codes.length - 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
      else if (e.key === ' ') {
        e.preventDefault();
        onNextBon();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bon.codes.length, onClose, onNextBon]);

  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label="Scanmodus">
      <div className="bar-top">
        <span>
          Bon {bonNr} · QR {c.index} von {c.count}
        </span>
        <button onClick={onClose}>Schließen</button>
      </div>
      <div className="qr-big">{c.matrix ? <QrSvg matrix={c.matrix} label={`QR-Code ${c.index} von ${c.count}`} /> : <div className="qr-err">{c.qrError}</div>}</div>
      <div className="bar-bottom">
        <button onClick={() => setI(idx - 1)} disabled={idx === 0}>
          ← Vorheriger Code
        </button>
        <button onClick={() => setI(idx + 1)} disabled={idx === bon.codes.length - 1}>
          Nächster Code →
        </button>
        <button onClick={onNextBon}>Nächster Bon (Leertaste)</button>
      </div>
    </div>
  );
}
