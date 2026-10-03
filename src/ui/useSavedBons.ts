import { useCallback, useState } from 'react';
import { DEFAULT_OPTIONS, MERCHANT, parseSavedBons, type SavedBon } from '../dakz';
import { KEYS, loadJson, saveJson } from './storage';

const defaults = { merchant: MERCHANT, options: DEFAULT_OPTIONS };

export function useSavedBons() {
  const [bons, setBons] = useState<SavedBon[]>(() => parseSavedBons(loadJson(KEYS.bons, []), defaults));

  const commit = useCallback((next: SavedBon[]) => {
    setBons(next);
    return saveJson(KEYS.bons, next);
  }, []);

  return {
    bons,
    upsert: (bon: SavedBon) => commit(bons.some((b) => b.id === bon.id) ? bons.map((b) => (b.id === bon.id ? bon : b)) : [...bons, bon]),
    remove: (id: string) => commit(bons.filter((b) => b.id !== id)),
    /** Importiert Bons; gleiche IDs werden ersetzt. Liefert die Anzahl. */
    importFile: (raw: unknown) => {
      const incoming = parseSavedBons(raw, defaults);
      const ids = new Set(incoming.map((b) => b.id));
      commit([...bons.filter((b) => !ids.has(b.id)), ...incoming]);
      return incoming.length;
    }
  };
}

export type SavedBonsApi = ReturnType<typeof useSavedBons>;
