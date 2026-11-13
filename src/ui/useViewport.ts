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
