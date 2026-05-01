import type { CacheStrategy } from '@nestjs-crud/core/cache';
import { type RedisLike, toRedisLike } from '@nestjs-crud/core/cache';

/**
 * BYO Redis-backed `CacheStrategy` for the MikroORM adapter.
 *
 * Accepts a `redis@5+` (node-redis) client, an `ioredis` client, or any object
 * implementing the `RedisLike` interface from `@nestjs-crud/core/cache`.
 * Auto-detection picks the right adapter; lazy-once auto-connect means you do
 * not need to call `await redis.connect()` before passing the client.
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
 * `invalidate(prefix)` uses non-blocking `scanPrefix` — NEVER `client.keys()`.
 *
 * **TTL units:** all `ttl` arguments are MILLISECONDS.
 *
 * **Single-flight:** the `inflight` Map prevents thundering-herd amplification on
 * cold cache. Concurrent `wrap('k', fetchFn, ttl)` callers for the same key await
 * the existing in-flight promise instead of each invoking `fetchFn` independently.
 *
 * `redis` and `ioredis` are optional peerDependencies. Consumers who never
 * instantiate this strategy do not need to install either.
 *
 * @since 2.2.0
 */
export class MikroOrmCacheStrategy implements CacheStrategy {
  private readonly redis: RedisLike;

  /** Single-flight de-dup map. Cleared on settle (resolve OR reject). */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(client: RedisLike | unknown) {
    this.redis = toRedisLike(client);
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
