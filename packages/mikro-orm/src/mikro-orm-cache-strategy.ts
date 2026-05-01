import type { CacheStrategy } from '@nestjs-crud/core/cache';

/**
 * Loose structural type matching `redis@5+` client without a hard peer-dep.
 * The consumer constructs a `createClient(...)` redis client and passes it in.
 * Uppercase `PX` is the millisecond option (not `EX`, which is seconds).
 */
type RedisClientLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
  del(keys: string | string[]): Promise<number>;
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string>;
};

/**
 * BYO Redis-backed `CacheStrategy` for the MikroORM adapter.
 *
 * **Bypasses** MikroORM's Result Cache (`em.find({ cache })`) on purpose:
 * `em.clearCache(key)` is exact-key delete only — no prefix scan — which makes
 * entity-prefix invalidation impossible without an external key registry.
 * BYO Redis with `SCAN + DEL` gives us uniform, non-blocking prefix invalidation
 * matching the TypeORM / Drizzle / Prisma Redis strategies.
 *
 * The MikroORM `EntityManager` is unaffected by this strategy — the `FetchHelper`
 * still calls `getEm()` fresh per request (preserving the ALS-backed identity-map
 * lifecycle); the cache wrap layers on TOP of the em-resolved fetch.
 *
 * `invalidate(prefix)` uses non-blocking `scanIterator` — NEVER `client.keys()`.
 *
 * **TTL units (FIX 1):** all `ttl` arguments are MILLISECONDS. The `set` call
 * uses `{ PX: ttl }` (uppercase PX = milliseconds; do NOT use `EX` which is seconds).
 *
 * **Single-flight (FIX 3):** the `inflight` Map prevents thundering-herd
 * amplification on cold cache. Concurrent `wrap('k', fetchFn, ttl)` callers for the
 * same key await the existing in-flight promise instead of each invoking `fetchFn`
 * independently.
 *
 * **Optional peer (FIX 10):** `redis` is an optional peerDependency. Consumers
 * who never instantiate this strategy do not need to install it.
 *
 * @since 2.2.0
 */
export class MikroOrmCacheStrategy implements CacheStrategy {
  /** Single-flight de-dup map. Cleared on settle (resolve OR reject). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly redisClient: RedisClientLike) {
    if (!redisClient || typeof redisClient.scanIterator !== 'function') {
      throw new Error(
        'MikroOrmCacheStrategy: invalid Redis client. Install `redis@^5.0.0` ' +
          '(declared as an optional peerDependency on @nestjs-crud/mikro-orm) ' +
          'and pass a connected client.',
      );
    }
  }

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
    const raw = await this.redisClient.get(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }

  public async set<T>(key: string, value: T, ttl: number): Promise<void> {
    // PX = milliseconds (FIX 1). Do not switch to EX (seconds).
    await this.redisClient.set(key, JSON.stringify(value), { PX: ttl });
  }

  public async invalidate(prefix: string): Promise<void> {
    const keys: string[] = [];
    for await (const key of this.redisClient.scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
      keys.push(key);
    }
    if (keys.length > 0) {
      await this.redisClient.del(keys);
    }
  }
}
