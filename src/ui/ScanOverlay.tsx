import { useEffect, useState } from 'react';
import { QUIET_MODULES } from '../qr/layout';
import { QrSvg } from './QrSvg';
import { KEYS, loadJson, saveJson } from './storage';
import type { RenderedBon } from './useCodes';
import { snapModulePx, useViewport } from './useViewport';

/** Gesamtmodule inklusive Ruhezone bei Version 40: Bei „wie Bon“ füllt dieser Code den Bildschirm, kleinere bleiben proportional kleiner. */
const MAX_TOTAL_MODULES = 177 + QUIET_MODULES * 2;
/** Platz für Kopf- und Fußleiste */
const BARS_PX = 150;

/** „füllend“: so groß wie möglich (zum Scannen vom Bildschirm) · „wie Bon“: kleine Codes bleiben kleiner */
type ScanSize = 'fill' | 'proportional';

interface Props {
  bon: RenderedBon;
  bonNr: string;
  duplicate: boolean;
  onClose: () => void;
  onNextBon: () => void;
  /** Ohne Angabe entfällt „Gleicher Einkauf, neue Nr.“ (Demo-Modus) */
  onRenumber?: () => void;
  nextLabel?: string;
}

/**
 * Bildschirmfüllende Anzeige zum Scannen vom Monitor.
 * Pfeiltasten: Teilcodes · Leertaste: nächster Bon · N: gleicher Einkauf mit neuer Bon-Nr. · Esc: schließen
 */
export function ScanOverlay({ bon, bonNr, duplicate, onClose, onNextBon, onRenumber, nextLabel = 'Nächster Bon' }: Props) {
  const [i, setI] = useState(0);
  const idx = Math.min(i, bon.codes.length - 1);
  const c = bon.codes[idx];
  const [size, setSize] = useState<ScanSize>(() => (loadJson<string>(KEYS.scanSize, 'fill') === 'proportional' ? 'proportional' : 'fill'));
  const { width, height, dpr } = useViewport();
  const room = Math.min(width - 32, height - BARS_PX);
  const total = c.matrix ? c.matrix.size + QUIET_MODULES * 2 : MAX_TOTAL_MODULES;
  // Ganzzahlige Gerätepixel je Modul: gleich breite Module, kein Moiré im Kamerabild
  const modulePx = size === 'fill' ? snapModulePx(room, total, dpr) : snapModulePx(Math.min(room, 680) / MAX_TOTAL_MODULES * total, total, dpr);
  const side = modulePx * total;

  useEffect(() => {
    saveJson(KEYS.scanSize, size);
  }, [size]);

  useEffect(() => setI(0), [bonNr]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, bon.codes.length - 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
      else if (e.key === ' ') {
        e.preventDefault();
        onNextBon();
      } else if ((e.key === 'n' || e.key === 'N') && onRenumber) onRenumber();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bon.codes.length, onClose, onNextBon, onRenumber]);

  return (
    <div className="scan" role="dialog" aria-modal="true" aria-label="Scanmodus">
      <div className="bar-top">
        <span>
          <span className="scan-nr">Bon {bonNr}</span> · QR {c.index} von {c.count}
          {c.matrix && ` · V${c.matrix.version} · ${Number((modulePx * dpr).toFixed(2))} Bildpunkte je Modul`}
          {duplicate && <span style={{ color: '#b83a12' }}> · Bon-Nr. bereits verwendet</span>}
        </span>
        <button onClick={onClose}>Schließen</button>
      </div>
      <div className="qr-big">{c.matrix ? <QrSvg matrix={c.matrix} label={`QR-Code ${c.index} von ${c.count}`} style={{ width: side, height: side }} /> : <div className="qr-err">{c.qrError}</div>}</div>
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
        <button onClick={() => setSize(size === 'fill' ? 'proportional' : 'fill')} title="Bildschirmfüllend lässt sich vom Monitor am besten scannen; „wie Bon“ zeigt kleine Codes kleiner">
          Größe: {size === 'fill' ? 'bildschirmfüllend' : 'wie Bon'}
        </button>
        {onRenumber && <button onClick={onRenumber}>Gleicher Einkauf, neue Nr. (N)</button>}
        <button onClick={onNextBon}>{nextLabel} (Leertaste)</button>
      </div>
    </div>
  );
}
