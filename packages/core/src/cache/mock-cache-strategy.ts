import type { CacheStrategy } from './cache-strategy.interface';

/**
 * In-memory `Map`-backed `CacheStrategy` for tests. NOT for production:
 * each process has its own `Map` so the cache does not survive restarts and
 * does not coordinate across workers.
 *
 * Uses `Date.now()` expiry on read instead of `setTimeout` cleanup so jest
 * does not need fake timers and there are no timer leaks between specs.
 *
 * Provides single-flight de-duplication via an `inflight` Map: while a fetch
 * for `key` is in progress, concurrent `wrap` callers for that same key await
 * the existing promise instead of each calling `fetchFn` independently
 * (prevents thundering-herd amplification on cold cache). Failed fetches are
 * NOT cached and the inflight entry is cleared on reject.
 *
 * @since 2.2.0
 */
export class MockCacheStrategy implements CacheStrategy {
  private readonly store = new Map<string, { value: unknown; expiresAt: number }>();

  /** Single-flight de-dup map. Cleared on settle (resolve OR reject). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  public async wrap<T>(key: string, fetchFn: () => Promise<T>, ttl: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    // Single-flight: if another caller is already fetching this key, await its promise.
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const pending = (async () => {
      try {
        const value = await fetchFn();
        await this.set(key, value, ttl);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, pending);
    return pending as Promise<T>;
  }

  public async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttl: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  public async invalidate(prefix: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}
