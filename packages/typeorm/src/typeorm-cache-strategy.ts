import type { CacheStrategy } from '@nestjs-crud/core/cache';
import { type RedisLike, toRedisLike } from '@nestjs-crud/core/cache';

/**
 * BYO Redis-backed `CacheStrategy` for the TypeORM adapter.
 *
 * Accepts a `redis@5+` (node-redis) client, an `ioredis` client, or any object
 * implementing the `RedisLike` interface from `@nestjs-crud/core/cache`.
 * Auto-detection picks the right adapter; lazy-once auto-connect means you do
 * not need to call `await redis.connect()` before passing the client.
 *
 * ```ts
 * // Option A — node-redis (v5)
 * import { createClient } from 'redis';
 * import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';
 *
 * const redis = createClient({ url: 'redis://localhost:6379' });
 * CrudConfigService.load({
 *   query: { cache: 5000, cacheStrategy: new TypeOrmCacheStrategy(redis) },
 * });
 *
 * // Option B — ioredis
 * import Redis from 'ioredis';
 * import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';
 *
 * const redis = new Redis({ host: 'localhost', port: 6379 });
 * CrudConfigService.load({
 *   query: { cache: 5000, cacheStrategy: new TypeOrmCacheStrategy(redis) },
 * });
 * ```
 *
 * `invalidate(prefix)` uses non-blocking `scanPrefix` — NEVER `client.keys()`,
 * which blocks Redis's single-threaded event loop.
 *
 * **TTL units:** all `ttl` arguments are MILLISECONDS.
 *
 * **Single-flight:** the `inflight` Map prevents thundering-herd amplification on
 * cold cache. Concurrent `wrap('k', fetchFn, ttl)` callers for the same key await
 * the existing in-flight promise instead of each invoking `fetchFn` independently.
 * Failed fetches are NOT cached; the inflight entry is cleared on reject so retries
 * work normally.
 *
 * @since 2.2.0
 */
export class TypeOrmCacheStrategy implements CacheStrategy {
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
