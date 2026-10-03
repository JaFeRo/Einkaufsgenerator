import { useEffect, useState } from 'react';
import { QrSvg } from './QrSvg';
import type { RenderedBon } from './useCodes';

interface Props {
  bon: RenderedBon;
  bonNr: string;
  duplicate: boolean;
  onClose: () => void;
  onNextBon: () => void;
  onRenumber: () => void;
}

/**
 * Bildschirmfüllende Anzeige zum Scannen vom Monitor.
 * Pfeiltasten: Teilcodes · Leertaste: nächster Bon · N: gleicher Einkauf mit neuer Bon-Nr. · Esc: schließen
 */
export function ScanOverlay({ bon, bonNr, duplicate, onClose, onNextBon, onRenumber }: Props) {
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
      } else if (e.key === 'n' || e.key === 'N') onRenumber();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bon.codes.length, onClose, onNextBon, onRenumber]);

  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label="Scanmodus">
      <div className="bar-top">
        <span>
          <span className="scan-nr">Bon {bonNr}</span> · QR {c.index} von {c.count}
          {duplicate && <span style={{ color: '#b83a12' }}> · Bon-Nr. bereits verwendet</span>}
        </span>
        <button onClick={onClose}>Schließen</button>
      </div>
      <div className="qr-big">{c.matrix ? <QrSvg matrix={c.matrix} label={`QR-Code ${c.index} von ${c.count}`} /> : <div className="qr-err">{c.qrError}</div>}</div>
      <div className="bar-bottom">
        {bon.codes.length > 1 && (
          <>
            <button onClick={() => setI(idx - 1)} disabled={idx === 0}>
              ← Vorheriger Code
            </button>
            <button onClick={() => setI(idx + 1)} disabled={idx === bon.codes.length - 1}>
              Nächster Code →
            </button>
          </>
        )}
        <button onClick={onRenumber}>Gleicher Einkauf, neue Nr. (N)</button>
        <button onClick={onNextBon}>Nächster Bon (Leertaste)</button>
      </div>
    </div>
  );
}
