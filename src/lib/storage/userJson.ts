export function readUserJson<T>(userId: string, key: string, defaultValue: T): T {
  try {
    if (typeof window === "undefined") return defaultValue; // server: no-op
    const storageKey = `agora:user:${userId}:${key}`;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function writeUserJson<T>(userId: string, key: string, value: T): void {
  try {
    if (typeof window === "undefined") return; // server: no-op
    const storageKey = `agora:user:${userId}:${key}`;
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // ignore
  }
}




