import type { CacheStrategy } from '@nestjs-crud/core/cache';
import { type RedisLike, toRedisLike } from '@nestjs-crud/core/cache';

/**
 * BYO Redis-backed `CacheStrategy` for the Prisma adapter.
 *
 * Accepts a `redis@5+` (node-redis) client, an `ioredis` client, or any object
 * implementing the `RedisLike` interface from `@nestjs-crud/core/cache`.
 * Auto-detection picks the right adapter; lazy-once auto-connect means you do
 * not need to call `await redis.connect()` before passing the client.
 *
 * Same SCAN+DEL invalidation pattern as `TypeOrmCacheStrategy`,
 * `MikroOrmCacheStrategy`, `DrizzleCacheStrategy`. Use this when you do not
 * want or have Prisma Accelerate (a managed cache layer) — a Redis cluster
 * gives you the same TTL + entity-prefix invalidation surface against your
 * own infra.
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
export class PrismaRedisCacheStrategy implements CacheStrategy {
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
