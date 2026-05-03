import type { CacheStrategy } from '@nestjs-crud/core/cache';
import { type RedisLike, toRedisLike } from '@nestjs-crud/core/cache';

export interface DrizzleCacheStrategyConfig {
  redisClient: RedisLike | unknown;
}

/**
 * BYO Redis-backed `CacheStrategy` for the Drizzle adapter.
 *
 * Constructor takes a config object (`{ redisClient }`) matching the rest of the
 * Drizzle adapter's config-object constructor convention. `redisClient` accepts a
 * `redis@5+` (node-redis) client, an `ioredis` client, or any object implementing
 * the `RedisLike` interface from `@nestjs-crud/core/cache`. Auto-detection picks
 * the right adapter; lazy-once auto-connect means you do not need to call
 * `await redis.connect()` before passing the client.
 *
 * Drizzle v0.45.x ships a first-party `Cache` abstract class at
 * `drizzle-orm/cache/core`, but we deliberately bypass it here:
 *
 *   - Drizzle's `Cache.put()` is SQL-hash-keyed (not entity-name-keyed),
 *     making our entity-prefix invalidation incompatible without re-keying.
 *   - Importing from `drizzle-orm/cache/core` would expose Drizzle internal
 *     type errors that `skipLibCheck: true` is currently suppressing.
 *
 * BYO Redis with the same SCAN+DEL pattern as the TypeORM / MikroORM /
 * Prisma Redis strategies gives us uniform invalidation across all 4 adapters.
 *
 * `invalidate(prefix)` uses non-blocking `scanPrefix` — NEVER `client.keys()`.
 *
 * **TTL units:** `ttl` is MILLISECONDS.
 *
 * **Single-flight:** the `inflight` Map prevents thundering-herd amplification on
 * cold cache.
 *
 * `redis` and `ioredis` are optional peerDependencies.
 *
 * @since 2.2.0
 */
export class DrizzleCacheStrategy implements CacheStrategy {
  private readonly redis: RedisLike;

  /** Single-flight de-dup map. Cleared on settle (resolve OR reject). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(config: DrizzleCacheStrategyConfig) {
    this.redis = toRedisLike(config?.redisClient);
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
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  }

  public async set<T>(key: string, value: T, ttl: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), ttl);
  }

  public async invalidate(prefix: string): Promise<void> {
    const keys: string[] = [];
    for await (const batch of this.redis.scanPrefix(prefix)) {
      keys.push(...batch);
    }
    if (keys.length > 0) {
      await this.redis.del(keys);
    }
  }
}
