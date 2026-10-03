/** localStorage mit Fehlertoleranz (privater Modus, volle Quote). */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const KEYS = {
  counter: 'dakz.bonCounter.v1',
  bons: 'dakz.savedBons.v1',
  current: 'dakz.current.v1'
} as const;
