/**
 * Simple in-memory cache om data persistent te houden tussen tab switches
 */

const cache = new Map<string, any>();

export function getCached<T>(key: string): T | null {
  return cache.get(key) ?? null;
}

export function setCache<T>(key: string, data: T): void {
  cache.set(key, data);
}

export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}
