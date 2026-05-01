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

export interface DrizzleCacheStrategyConfig {
  redisClient: RedisClientLike;
}

/**
 * BYO Redis-backed `CacheStrategy` for the Drizzle adapter.
 *
 * Drizzle v0.45.x ships a first-party `Cache` abstract class at
 * `drizzle-orm/cache/core`, but we deliberately bypass it here:
 *
 *   - Drizzle's `Cache.put()` is SQL-hash-keyed (not entity-name-keyed),
 *     making our entity-prefix invalidation incompatible without re-keying.
 *   - Importing from `drizzle-orm/cache/core` would expose Drizzle internal
 *     type errors that `skipLibCheck: true` is currently suppressing
 *     (TYPES-06 permanently deferred per project roadmap).
 *
 * BYO Redis with the same SCAN+DEL pattern as the TypeORM / MikroORM /
 * Prisma Redis strategies gives us uniform invalidation across all 4 adapters.
 *
 * Constructor takes a config object per project convention — matches the rest
 * of the Drizzle adapter's config-object ctor convention.
 *
 * `invalidate(prefix)` uses non-blocking `scanIterator` — NEVER `client.keys()`.
 *
 * **TTL units (FIX 1):** `ttl` is MILLISECONDS. The `set` call uses `{ PX: ttl }`
 * (uppercase PX = milliseconds; do NOT use `EX` which is seconds).
 *
 * **Single-flight (FIX 3):** the `inflight` Map prevents thundering-herd
 * amplification on cold cache.
 *
 * **Optional peer (FIX 10):** `redis` is an optional peerDependency.
 *
 * @since 2.2.0
 */
export class DrizzleCacheStrategy implements CacheStrategy {
  private readonly redisClient: RedisClientLike;

  /** Single-flight de-dup map. Cleared on settle (resolve OR reject). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(config: DrizzleCacheStrategyConfig) {
    if (!config?.redisClient || typeof config.redisClient.scanIterator !== 'function') {
      throw new Error(
        'DrizzleCacheStrategy: invalid Redis client. Install `redis@^5.0.0` ' +
          '(declared as an optional peerDependency on @nestjs-crud/drizzle) ' +
          'and pass `{ redisClient }` with a connected client.',
      );
    }
    this.redisClient = config.redisClient;
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
