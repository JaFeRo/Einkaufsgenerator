import { useEffect, useState } from 'react';

/** Fenstergröße und Pixeldichte; aktualisiert sich bei Größenänderung und beim Zoomen des Browsers. */
export function useViewport() {
  const read = () => ({ width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 });
  const [v, setV] = useState(read);
  useEffect(() => {
    const onResize = () => setV(read());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return v;
}

/**
 * Bildpunkte je Modul für die Bildschirmanzeige: ganzzahlig in Gerätepixeln, damit jedes Modul gleich
 * breit ist. Gebrochene Werte (z. B. 2,1 px) ergeben abwechselnd 2 und 3 Pixel breite Module und Moiré im Kamerabild.
 */
export function snapModulePx(availableCssPx: number, totalModules: number, dpr: number, maxCssPx = Infinity): number {
  const device = Math.floor((Math.min(availableCssPx, maxCssPx) * dpr) / totalModules);
  return Math.max(1, device) / dpr;
}
