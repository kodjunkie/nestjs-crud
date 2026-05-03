# Caching

`@nestjs-crud` ships a unified `CacheStrategy` interface in `@nestjs-crud/core/cache` and per-adapter implementations for TypeORM, MikroORM, Drizzle, and Prisma. `@Crud({ query: { cache: <ttl-ms> } })` is honored across all four adapters when a strategy is wired.

## Overview

The cache lives at the `FetchHelper` layer of each adapter — `executeMany` and `findOneOrFail` wrap their fetches in `cacheStrategy.wrap(key, fetchFn, ttl)`. Write methods (`createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`) call `cacheStrategy.invalidate('<entityName>:')` after a successful commit, so cached entries are evicted as soon as the underlying data changes.

The `CacheStrategy` contract is four methods. **All `ttl` arguments are in milliseconds** across the unified contract (the Prisma Accelerate strategy converts to seconds internally because Accelerate's API takes seconds; everywhere else `ttl` flows through unchanged):

```ts
interface CacheStrategy {
  wrap<T>(key: string, fetchFn: () => Promise<T>, ttl: number): Promise<T>;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl: number): Promise<void>;
  invalidate(prefix: string): Promise<void>;
}
```

`MockCacheStrategy` (a `Map`-backed implementation with single-flight de-duplication) ships from `@nestjs-crud/core` for tests.

## Global setup

Wire one strategy globally via `CrudConfigService.load`. All controllers using `@Crud({ query: { cache } })` will use it.

Strategies accept both `redis` (node-redis v5) and `ioredis` clients. Auto-connect on first op — no explicit `await redis.connect()` needed.

```ts
// Option A — node-redis (v5)
import { createClient } from 'redis';
import { CrudConfigService } from '@nestjs-crud/core';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = createClient({ url: 'redis://localhost:6379' });
// No explicit connect() needed — strategy auto-connects on first cache op
CrudConfigService.load({
  query: {
    cache: 5000, // default TTL in ms
    cacheStrategy: new TypeOrmCacheStrategy(redis),
  },
});

// Option B — ioredis
import Redis from 'ioredis';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = new Redis({ host: 'localhost', port: 6379 });
CrudConfigService.load({
  query: {
    cache: 5000,
    cacheStrategy: new TypeOrmCacheStrategy(redis),
  },
});
```

Resolution order at the FetchHelper level: per-service constructor argument overrides global; global config wins when no constructor override; absent strategy with `@Crud({ query: { cache } })` set throws `CrudCacheNotConfiguredError` at the first cached read.

## Per-adapter strategy setup

### TypeORM

Pass either a `redis@5+` (node-redis) or `ioredis` client. No explicit `connect()` needed — the strategy auto-connects on the first cache operation.

```ts
// Option A — node-redis (v5)
import { createClient } from 'redis';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = createClient({ url: 'redis://localhost:6379' });
const cacheStrategy = new TypeOrmCacheStrategy(redis);

// Option B — ioredis
import Redis from 'ioredis';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = new Redis({ host: 'localhost', port: 6379 });
const cacheStrategy = new TypeOrmCacheStrategy(redis);

CrudConfigService.load({
  query: { cache: 5000, cacheStrategy },
});
```

When a `CacheStrategy` is wired, the adapter skips TypeORM's native `query.cache(ttl)` step — caching happens in the strategy only, so prefix-invalidation works without leaving stale entries in `DataSource.cache`. The legacy `DataSource.cache` provider continues to work as a fallback when no `CacheStrategy` is wired (the native pass-through is marked `@deprecated` and is on a v3 removal track).

### MikroORM

The strategy bypasses MikroORM's Result Cache because `em.clearCache(key)` is exact-key only — entity-prefix invalidation is not possible through it.

```ts
// Option A — node-redis (v5)
import { createClient } from 'redis';
import { MikroOrmCacheStrategy } from '@nestjs-crud/mikro-orm';

const redis = createClient({ url: 'redis://localhost:6379' });
const cacheStrategy = new MikroOrmCacheStrategy(redis);

// Option B — ioredis
import Redis from 'ioredis';
import { MikroOrmCacheStrategy } from '@nestjs-crud/mikro-orm';

const redis = new Redis({ host: 'localhost', port: 6379 });
const cacheStrategy = new MikroOrmCacheStrategy(redis);

CrudConfigService.load({
  query: { cache: 5000, cacheStrategy },
});
```

The MikroORM `EntityManager` thunk is preserved — the cache wrap goes around `getEm()`, which is still called fresh per request to honor request-scope identity-map isolation.

### Drizzle

The strategy is independent of Drizzle's first-party `Cache` abstract class (which is SQL-hash-keyed and incompatible with our entity-prefix invalidation). Takes a config object (`{ redisClient }`) matching the Drizzle adapter's config-object constructor convention.

```ts
// Option A — node-redis (v5)
import { createClient } from 'redis';
import { DrizzleCacheStrategy } from '@nestjs-crud/drizzle';

const redis = createClient({ url: 'redis://localhost:6379' });
const cacheStrategy = new DrizzleCacheStrategy({ redisClient: redis });

// Option B — ioredis
import Redis from 'ioredis';
import { DrizzleCacheStrategy } from '@nestjs-crud/drizzle';

const redis = new Redis({ host: 'localhost', port: 6379 });
const cacheStrategy = new DrizzleCacheStrategy({ redisClient: redis });

CrudConfigService.load({
  query: { cache: 5000, cacheStrategy },
});
```

### Prisma — Redis

```ts
// Option A — node-redis (v5)
import { createClient } from 'redis';
import { PrismaRedisCacheStrategy } from '@nestjs-crud/prisma';

const redis = createClient({ url: 'redis://localhost:6379' });
const cacheStrategy = new PrismaRedisCacheStrategy(redis);

// Option B — ioredis
import Redis from 'ioredis';
import { PrismaRedisCacheStrategy } from '@nestjs-crud/prisma';

const redis = new Redis({ host: 'localhost', port: 6379 });
const cacheStrategy = new PrismaRedisCacheStrategy(redis);

CrudConfigService.load({
  query: { cache: 5000, cacheStrategy },
});
```

### Prisma — Accelerate

For consumers using [Prisma Accelerate](https://www.prisma.io/docs/accelerate), the Accelerate strategy attaches `cacheStrategy: { ttl }` to the per-query Prisma delegate args via shared async-context. The cache lives at the Accelerate API gateway, not in the application process.

`PrismaAccelerateCacheStrategy.wrap(key, fetchFn, ttl)` accepts `ttl` in milliseconds (matching the unified contract) and converts to seconds internally via `Math.ceil(ttl / 1000)` for Accelerate's API. Round-up via `Math.ceil` ensures we never under-cache (e.g. `ttl=1500ms` → 2 seconds, not 1).

```ts
import { PrismaClient } from '@prisma/client';
import { withAccelerate } from '@prisma/extension-accelerate';
import { PrismaAccelerateCacheStrategy } from '@nestjs-crud/prisma';

const prisma = new PrismaClient().$extends(withAccelerate());

CrudConfigService.load({
  query: { cache: 5000, cacheStrategy: new PrismaAccelerateCacheStrategy(prisma) },
});
```

`@prisma/extension-accelerate` is declared as an optional `peerDependency` on `@nestjs-crud/prisma`. Consumers without Accelerate install cleanly; the constructor throws a clear error if you instantiate `PrismaAccelerateCacheStrategy` without `withAccelerate()` applied.

### Choosing between Redis and Accelerate (Prisma)

| | Redis | Accelerate |
|---|---|---|
| Where the cache lives | Your Redis cluster | Prisma's managed gateway |
| Network hop | Application → Redis | Application → Accelerate → DB |
| Invalidation API | `SCAN + DEL` (prefix-scan pattern) | `$accelerate.invalidate({ tags })` |
| TTL semantics | Set per `wrap()` call (ms) | Set per query arg (seconds; auto-converted) |
| Operational ownership | You operate Redis | Prisma operates Accelerate |
| Cost model | Self-hosted | Managed (pricing varies) |

Use Redis when you already operate one and want full control. Use Accelerate when you want a managed cache with global edge replication and are already on Prisma's hosted offering.

## Per-request opt-out

Pass `?cache=0` to bypass the cache for a single request. Useful right after writes, or for admin tools that need a fresh read.

```
GET /users?cache=0
```

The bypass is read-only — the cached entry is not invalidated; the TTL keeps running. Subsequent requests without the flag continue to hit the cache until TTL expires or a write triggers prefix invalidation.

Recognized values: `?cache=0`, `?cache=1`, `?cache=true`, `?cache=false`. Unrecognized values (e.g. `?cache=foo`) are silently ignored — the request behaves as if the flag were absent. Numeric TTL overrides like `?cache=300000` continue to work via the legacy `parsed.cache: number` field for the TypeORM-native fallback path.

## Auto-invalidate on writes

Every write method (`createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`) calls `cacheStrategy.invalidate('<entityName>:')` after the underlying transaction commits. Consumers do not need to manually evict. TTL still acts as a safety net for any out-of-band invalidation paths (e.g. another service mutating the table).

## `cacheErrorPolicy` — graceful degradation under cache outage

Set `CrudConfigService.config.query.cacheErrorPolicy` to control behavior when `cacheStrategy.wrap()` rejects (Redis down, network blip, Accelerate timeout, etc.):

```ts
CrudConfigService.load({
  query: {
    cache: 5000,
    cacheStrategy: new TypeOrmCacheStrategy(redis),
    cacheErrorPolicy: 'fallback-to-source', // graceful degradation
  },
});
```

| Policy | Behavior | When to use |
|---|---|---|
| `'fail-fast'` (default) | Propagate the wrap error. The request fails with the underlying backend exception. | Development, staging, and any environment where you want cache misconfiguration or outages to surface immediately. Matches pre-strategy semantics. |
| `'fallback-to-source'` | Catch the error, log a warning, and call `fetchFn()` directly so the request still succeeds. | Production with a non-critical cache layer. Use when you'd rather absorb a Redis outage as elevated DB load than as an API outage. |

The default is `'fail-fast'` — explicit opt-in is required for graceful degradation.

## Production Tuning

### Redis `maxmemory-policy`

For Redis-backed strategies (TypeORM, MikroORM, Drizzle, Prisma Redis), configure your Redis instance with:

```
maxmemory-policy allkeys-lru
```

Cache keys are derived from the full request fingerprint (filter, search, joins, sort, pagination, authPersist) — heavy filter/sort/pagination diversity produces unbounded key cardinality. `allkeys-lru` evicts the least-recently-used keys when `maxmemory` is reached, preventing OOM crashes.

`volatile-lru` works too if every key has a TTL (which `@nestjs-crud` does set via `wrap(..., ttl)`), but `allkeys-lru` is safer because it covers any keys your application might write directly to the same Redis instance for unrelated purposes.

### Single-flight de-duplication

All adapter Redis strategies (and `MockCacheStrategy`) provide single-flight de-duplication: when N concurrent requests hit the same cold cache key, only ONE invokes the underlying database fetch — the other N-1 await the in-flight promise. This prevents thundering-herd amplification on cache misses (e.g. cache stampede after a TTL expiry under load).

The de-duplication map is per-process per-instance; it does NOT coordinate across workers. If you run multiple application processes against the same Redis cluster, each process can still do one fetch on cold cache (one stampede per worker, not one per request). For most workloads this is acceptable; for very hot keys, consider longer TTLs or Redis-side request coalescing.

## Security: auth-persist + cache keys

`buildCacheKey(entityName, parsed)` includes the request's `authPersist` value in the cache-key fingerprint. Two users with different `authPersist` (e.g. different `tenantId`) get DIFFERENT cache keys — multi-tenant isolation is preserved.

The `authPersist` value is hashed via SHA-1 (alongside the other request inputs) before being stored in Redis as part of the cache key. Plaintext auth context (tenant IDs, user IDs, persisted claims) never appears in cache keys directly. This mitigates two risks:

- **PII leakage via cache-key inspection.** Anyone with `KEYS *` access to your Redis instance sees only `<EntityName>:<16-hex-hash>`, never the persisted auth context.
- **Timing attacks via cache-key enumeration.** Without the SHA-1 fingerprint, an attacker probing cache hit-rates could enumerate valid `authPersist` values; with the hash, they get no signal.

SHA-1 here is used as a non-cryptographic fingerprint (16 hex chars = 64 bits of collision space, sufficient for cache-key uniqueness within entity scope) — not for authentication. If your threat model treats SHA-1 collisions as material, implement a custom strategy that re-hashes with SHA-256.

## Rate limiting

`@nestjs/throttler` runs at the controller layer (as a Guard); `cacheStrategy.wrap()` runs at the FetchHelper service layer. The execution order is: throttler → handler → cache.

This means **cache hits still count against rate limits** (the throttler runs before the request reaches the controller handler, regardless of whether the handler ends up serving a cached or fresh response). No special configuration is required to combine the two — they layer naturally.

If you want cache hits to NOT count against the rate limit (i.e. effectively skip the throttler when serving from cache), you would need to invert the order by manually checking the cache before `@UseGuards(ThrottlerGuard)` runs — but this is non-trivial and rarely worth it: rate limits exist to protect upstream resources (DB, external APIs), and a request served from cache still consumed your application's CPU/memory.

## `CrudCacheNotConfiguredError`

If `@Crud({ query: { cache } })` is set but no `CacheStrategy` is wired (and, for TypeORM, no `DataSource.cache` fallback either), the next cached read throws:

```
CrudCacheNotConfiguredError: @Crud cache option requires a CacheStrategy. Configure via CrudConfigService.load({ query: { cacheStrategy } }) or pass a strategy to the CrudService constructor. For TypeORM, the legacy DataSource.cache provider is also accepted as a fallback.
```

It is a plain `Error` subclass, not an `HttpException`, so the full message lands in your logs. Cache misconfiguration is a deployment bug; surfacing it loudly is the point.

## Advanced

### Custom key factory

By default the cache key is a deterministic SHA-1 hash of the entity name plus the parsed request fields (filter, search, joins, sort, select, limit, offset, page, authPersist). To customize:

```ts
@Crud({
  model: { type: User },
  query: {
    cache: {
      ttl: 5000,
      keyFactory: (req) => `tenant:${req.options.auth?.persist?.tenantId}:${defaultKey(req)}`,
    },
  },
})
@Controller('users')
export class UsersController { /* ... */ }
```

### Custom Redis client via `RedisLike`

The four shipped Redis strategies accept any object that implements the `RedisLike` interface from `@nestjs-crud/core/cache`. This lets you adapt any cache backend — Memcached, an in-process `Map`, a hybrid store — without wrapping it in a full strategy class:

```ts
import type { RedisLike } from '@nestjs-crud/core/cache';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const myBackend: RedisLike = {
  async set(key, value, ttlMs) { /* your impl */ },
  async get(key) { /* your impl */ },
  async del(keys) { /* your impl */ },
  async *scanPrefix(prefix, count = 100) { /* yield string[] batches */ },
};

const cacheStrategy = new TypeOrmCacheStrategy(myBackend);
```

The same `RedisLike` object can be passed to any of the four strategy ctors — `TypeOrmCacheStrategy`, `MikroOrmCacheStrategy`, `DrizzleCacheStrategy({ redisClient })`, `PrismaRedisCacheStrategy`.

### Disconnect on shutdown

Call your client's disconnect method from `OnApplicationShutdown` to close the connection cleanly:

```ts
// node-redis
async onApplicationShutdown() {
  await redisClient.disconnect();
}

// ioredis
async onApplicationShutdown() {
  await redisClient.quit();
}
```

### Implementing a custom `CacheStrategy`

The interface is four methods. Any in-process `Map`, Redis cluster, Memcached pool, or external service can back it:

```ts
import type { CacheStrategy } from '@nestjs-crud/core/cache';

class MyCacheStrategy implements CacheStrategy {
  async wrap<T>(key: string, fetchFn: () => Promise<T>, ttl: number): Promise<T> { /* ... */ }
  async get<T>(key: string): Promise<T | undefined> { /* ... */ }
  async set<T>(key: string, value: T, ttl: number): Promise<void> { /* ... */ }
  async invalidate(prefix: string): Promise<void> { /* ... */ }
}
```

Implementation guidance:

- `invalidate(prefix)` should be a non-blocking prefix scan. For Redis-backed custom backends, use `client.scanIterator({ MATCH: prefix + '*', COUNT: 100 })` (node-redis) or `client.scanStream({ match: prefix + '*', count: 100 })` (ioredis) plus batch `del` — never `client.keys()`, which blocks Redis's single-threaded event loop.
- `wrap()` SHOULD provide single-flight de-duplication keyed on `key` (an in-flight `Map<string, Promise<T>>` with `try/finally` cleanup) to prevent thundering-herd amplification on cold caches. All shipped adapter strategies follow this pattern.
- All `ttl` arguments are MILLISECONDS uniformly across the contract. If your backend takes seconds, convert at the strategy boundary (the way `PrismaAccelerateCacheStrategy` does via `Math.ceil(ttl/1000)`).

## See also

- `CacheStrategy` interface: [`packages/core/src/cache/cache-strategy.interface.ts`](https://github.com/kodjunkie/nestjs-crud/blob/master/packages/core/src/cache/cache-strategy.interface.ts)
- `MockCacheStrategy` (test helper): [`packages/core/src/cache/mock-cache-strategy.ts`](https://github.com/kodjunkie/nestjs-crud/blob/master/packages/core/src/cache/mock-cache-strategy.ts)
- TypeORM caching docs: https://typeorm.io/caching
- MikroORM caching docs: https://mikro-orm.io/docs/caching
- Prisma Accelerate: https://www.prisma.io/docs/accelerate
- Redis `maxmemory-policy`: https://redis.io/docs/latest/operate/oss_and_stack/management/config/#maxmemory-policy
