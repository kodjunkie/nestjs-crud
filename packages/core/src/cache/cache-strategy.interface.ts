/**
 * Pluggable cache backend for @nestjs-crud adapters.
 *
 * Implementations wrap reads (`executeMany` / `findOneOrFail`) in each adapter's
 * `FetchHelper` and are invalidated by entity-name prefix after each successful
 * write (`createOne` / `createMany` / `updateOne` / `replaceOne` / `deleteOne` /
 * `recoverOne`).
 *
 * Wired globally via `CrudConfigService.load({ query: { cacheStrategy } })` or
 * per-service via constructor injection. Resolution order: ctor > global > throw.
 *
 * Reference implementations ship with each adapter:
 *   - `@nestjs-crud/typeorm` — `TypeOrmCacheStrategy` (BYO Redis)
 *   - `@nestjs-crud/mikro-orm` — `MikroOrmCacheStrategy` (BYO Redis; bypasses
 *     MikroORM Result Cache because `em.clearCache(key)` is exact-key only)
 *   - `@nestjs-crud/drizzle` — `DrizzleCacheStrategy` (BYO Redis)
 *   - `@nestjs-crud/prisma` — `PrismaRedisCacheStrategy` and
 *     `PrismaAccelerateCacheStrategy`
 *
 * `MockCacheStrategy` (this package) is a `Map`-backed implementation for tests.
 *
 * @since 2.2.0
 */
export interface CacheStrategy {
  /**
   * Memoize: read from cache, otherwise call `fetchFn` and cache the result for `ttl` ms.
   *
   * @param key      cache key (typically the output of `buildCacheKey(entityName, parsed)`)
   * @param fetchFn  thunk that produces the value on cache miss
   * @param ttl      time-to-live in **MILLISECONDS** — uniform across the unified contract.
   *                 Per-adapter conversion details:
   *                   - TypeORM `query.cache(ttl)` accepts ms directly (no conversion).
   *                   - Redis-backed strategies (TypeORM/MikroORM/Drizzle/Prisma) use
   *                     `client.set(key, value, { PX: ttl })` (uppercase `PX` — milliseconds;
   *                     do NOT use `EX` which is seconds).
   *                   - `PrismaAccelerateCacheStrategy` converts to seconds for the Accelerate
   *                     API: `ttlSeconds = Math.ceil(ttl / 1000)` then passes
   *                     `cacheStrategy: { ttl: ttlSeconds }` per-query.
   *
   * Implementations SHOULD provide single-flight de-duplication keyed on `key` to
   * prevent thundering-herd amplification on cold caches: concurrent `wrap()` calls
   * with the same key while one fetch is in flight should await the existing promise
   * rather than each invoking `fetchFn` independently.
   */
  wrap<T>(key: string, fetchFn: () => Promise<T>, ttl: number): Promise<T>;
  /** Low-level read primitive. Returns undefined if not cached or expired. */
  get<T>(key: string): Promise<T | undefined>;
  /** Low-level write primitive. `ttl` is in MILLISECONDS (matches `wrap`). */
  set<T>(key: string, value: T, ttl: number): Promise<void>;
  /** Evict every entry whose key starts with prefix. Used by write-path auto-invalidation. */
  invalidate(prefix: string): Promise<void>;
}
