// Tiny localStorage helper used ONLY by adapters under src/services/adapters/local/**.
// UI must NEVER import this file.

const PREFIX = "ndshop:";

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(PREFIX + key) : null;
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota / SSR */
  }
}

export function removeKey(key: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
