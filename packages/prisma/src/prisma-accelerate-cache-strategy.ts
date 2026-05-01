import { AsyncLocalStorage } from 'async_hooks';

import type { CacheStrategy } from '@nestjs-crud/core/cache';

export interface PrismaAccelerateContext {
  /** Accelerate's `cacheStrategy.ttl` is in **SECONDS** (per Accelerate API contract). */
  cacheStrategy?: { ttl: number };
}

interface PrismaClientWithAccelerate {
  $accelerate?: { invalidate: (args: { tags: string[] }) => Promise<unknown> };
}

/**
 * Prisma Accelerate-backed `CacheStrategy`.
 *
 * Accelerate caches at the API gateway, not in process memory. Its
 * `cacheStrategy: { ttl }` option is passed PER-QUERY into `findMany`/`findFirst`,
 * not as a wrapper around the result. This strategy bridges the two worlds:
 *
 *   `PrismaAccelerateCacheStrategy.wrap(key, fetchFn, ttl)` attaches
 *   `{ cacheStrategy: { ttl: ttlSeconds } }` to a process-wide `AsyncLocalStorage`
 *   context while `fetchFn()` runs. `PrismaFetchHelper` reads the context inside
 *   its `executeMany`/`findOneOrFail` and merges `cacheStrategy: { ttl }` into the
 *   Prisma delegate args before invoking the query.
 *
 *   Concurrent requests do not bleed TTL into each other's args — `AsyncLocalStorage`
 *   isolates per async-call-stack.
 *
 * **TTL units (FIX 1):** the unified `CacheStrategy.wrap(...)` contract takes
 * `ttl` in MILLISECONDS, but Accelerate's per-query `cacheStrategy: { ttl }`
 * option takes SECONDS. This strategy is the ONLY adapter strategy that
 * performs unit conversion — `ttlSeconds = Math.ceil(ttl / 1000)` — to bridge
 * the two contracts. Round-up via `Math.ceil` ensures we never under-cache
 * (e.g. `ttl=1500ms` rounds up to 2 seconds, not 1).
 *
 * `invalidate(prefix)` calls `$accelerate.invalidate({ tags: [prefix] })`.
 * Accelerate accepts up to 5 tags per call; we always pass exactly 1 (the
 * entity-name prefix), so the limit is never reached.
 *
 * Requires `@prisma/extension-accelerate@^3.0.0` (declared as an optional peer
 * on `@nestjs-crud/prisma` per FIX 10). The constructor throws if the consumer's
 * `PrismaClient` was not extended with `withAccelerate()` (no `$accelerate`
 * method present on the client).
 *
 * @since 2.2.0
 */
export class PrismaAccelerateCacheStrategy implements CacheStrategy {
  /**
   * Per-async-stack context. `PrismaFetchHelper` reads `getStore()` to learn the
   * TTL the consumer asked for (in seconds), then merges into delegate args.
   */
  public static readonly currentContext = new AsyncLocalStorage<PrismaAccelerateContext>();

  constructor(private readonly prisma: PrismaClientWithAccelerate) {
    if (typeof this.prisma.$accelerate?.invalidate !== 'function') {
      throw new Error(
        'PrismaAccelerateCacheStrategy: $accelerate not found on PrismaClient. ' +
          'Apply the extension first: `prisma.$extends(withAccelerate())`. ' +
          'Install the optional peer with `npm install @prisma/extension-accelerate`.',
      );
    }
  }

  public async wrap<T>(_key: string, fetchFn: () => Promise<T>, ttl: number): Promise<T> {
    // FIX 1 — convert milliseconds → seconds for Accelerate's API.
    // Math.ceil ensures we never under-cache (e.g. 1500ms rounds up to 2s, not 1).
    const ttlSeconds = Math.ceil(ttl / 1000);
    return PrismaAccelerateCacheStrategy.currentContext.run({ cacheStrategy: { ttl: ttlSeconds } }, fetchFn);
  }

  public async get<T>(_key: string): Promise<T | undefined> {
    // Accelerate manages its own cache at the gateway; no local store to read.
    return undefined;
  }

  public async set<T>(_key: string, _value: T, _ttl: number): Promise<void> {
    // Accelerate writes are gateway-managed via the cacheStrategy option on the
    // delegate call. Nothing to do here.
  }

  public async invalidate(prefix: string): Promise<void> {
    // Map entity-name prefix to a single Accelerate cacheTag.
    // The 5-tag-per-call limit (Accelerate API) is not reached — we always pass 1.
    await this.prisma.$accelerate!.invalidate({ tags: [prefix] });
  }
}
