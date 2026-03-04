/**
 * In-memory TTL cache for marketplace project data.
 *
 * Keyed by an arbitrary string (e.g. "all" or "C01").
 * Survives across requests within the same Node.js cold-start.
 *
 * TODO: Replace with Redis or Supabase for persistence across server restarts.
 * TODO: Add single-flight (cache stampede) protection before production.
 */

interface CacheEntry<T> {
  data: T;
  cachedAt: number;   // Date.now() timestamp
  ttlMs: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export const DEFAULT_TTL_MS = 5 * 60 * 1_000; // 5 minutes

export function cacheGet<T>(key: string): { data: T; cachedAt: number; ttlMs: number } | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > entry.ttlMs) {
    store.delete(key);
    return null;
  }
  return { data: entry.data, cachedAt: entry.cachedAt, ttlMs: entry.ttlMs };
}

export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { data, cachedAt: Date.now(), ttlMs });
}

export function cacheClear(key?: string): void {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}
