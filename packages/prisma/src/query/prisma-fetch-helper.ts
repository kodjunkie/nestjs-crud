import { CrudCacheNotConfiguredError, CrudConfigService } from '@nestjs-crud/core';
import type { CrudRequestOptions } from '@nestjs-crud/core';
import { buildCacheKey } from '@nestjs-crud/core/cache';
import type { CacheStrategy } from '@nestjs-crud/core/cache';
import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';
import type { ParsedRequestParams } from '@nestjs-crud/request';
import { Logger } from '@nestjs/common';

import { PrismaAccelerateCacheStrategy } from '../prisma-accelerate-cache-strategy';

/**
 * @internal — subject to change without semver-major.
 * Executes prepared Prisma arg-object queries: count, findOne, executeMany.
 *
 * ### getDelegate thunk contract
 *
 * The ctor takes `getDelegate: () => any` — a thunk, NOT a captured delegate
 * instance. This matches MikroORM's `getEm` pattern and protects against stale
 * delegate references across `$transaction` scopes.
 *
 * **Cache-wrap closures MUST call getDelegate() INSIDE the closure body** —
 * capturing the delegate outside the closure re-introduces the cross-scope bug.
 */

// Type debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export interface PrismaFetchHelperConfig {
  /** thunk — matches MikroORM's getEm pattern; protects against stale references across $transaction scopes */
  getDelegate: () => any;

  onNotFound: (alias: string) => void;

  /** Optional cache backend; resolved at request time (ctor field > CrudConfigService global). */
  cacheStrategy?: CacheStrategy;

  /** Entity name used as cache-key prefix (required when cacheStrategy is set). */
  entityName?: string;

  /** Optional logger threaded into withCacheErrorPolicy (FIX 2). */
  logger?: {
    warn?: (msg: string) => void;
    error?: (msg: string, trace?: string) => void;
    [k: string]: any;
  };
}

export class PrismaFetchHelper implements FetchHelper<any> {
  private readonly logger: { warn?: (msg: string) => void; [k: string]: any };

  constructor(private readonly config: PrismaFetchHelperConfig) {
    this.logger = config.logger ?? new Logger(PrismaFetchHelper.name);
  }

  public async count(qb: any): Promise<number> {
    const delegate = this.config.getDelegate();
    return delegate.count({ where: qb.where });
  }

  public async findOneOrFail<R = unknown>(
    qb: any,
    opts: FetchHelperFindOneOpts,
    parsed?: ParsedRequestParams,
    options?: CrudRequestOptions,
  ): Promise<R> {
    // D-11 fail-fast: throw UNCONDITIONALLY if @Crud cache set without strategy
    // AND consumer did not bypass. No "[200, 500] adjust based on" — matches TypeORM behavior.
    this.assertStrategyOrPassThrough(parsed, options);

    const fetchFn = async (): Promise<unknown> => {
      const delegate = this.config.getDelegate(); // thunk — fresh per closure run
      const { include, select, where } = qb;
      const args: any = { where };
      if (select) args.select = select;
      else if (include) args.include = include;
      // Merge Accelerate context arg if present (Accelerate strategy attaches via wrap;
      // ttl already in seconds per FIX 1 ms→s conversion in PrismaAccelerateCacheStrategy.wrap).
      const ctx = PrismaAccelerateCacheStrategy.currentContext.getStore();
      if (ctx?.cacheStrategy) args.cacheStrategy = ctx.cacheStrategy;
      return delegate.findFirst(args);
    };

    const row = await this.wrapRead(fetchFn, parsed, options);

    if (!row) {
      (opts.onNotFound ?? this.config.onNotFound)('');
    }
    return row as R;
  }

  public async executeMany<R = unknown>(
    qb: any,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<R[]> {
    // D-11 fail-fast (UNCONDITIONAL).
    this.assertStrategyOrPassThrough(parsed, options);

    const fetchFn = async (): Promise<unknown[]> => {
      const delegate = this.config.getDelegate(); // thunk — fresh per closure run
      const args = { ...qb };
      // Merge Accelerate context arg if present (ttl in seconds per FIX 1)
      const ctx = PrismaAccelerateCacheStrategy.currentContext.getStore();
      if (ctx?.cacheStrategy) args.cacheStrategy = ctx.cacheStrategy;
      return delegate.findMany(args);
    };

    if (!this.shouldCache(parsed, options)) {
      return (await fetchFn()) as unknown as R[];
    }
    const ttl = this.getEffectiveTtl(options)!;
    const key = buildCacheKey(this.config.entityName!, parsed);
    return (await this.withCacheErrorPolicy(
      () => this.getResolvedStrategy()!.wrap(key, fetchFn, ttl),
      fetchFn,
    )) as unknown as R[];
  }

  // ----- private cache helpers -----

  /**
   * Lazily resolve the effective cache strategy.
   * Priority: ctor-injected config field > CrudConfigService global > undefined.
   * Called at request time so `CrudConfigService.load(...)` after app bootstrap works.
   */
  private getResolvedStrategy(): CacheStrategy | undefined {
    return this.config.cacheStrategy ?? CrudConfigService.config.query?.cacheStrategy;
  }

  /**
   * Internal cache wrapper used by `findOneOrFail`. Both `executeMany` and
   * `findOneOrFail` derive the cache key from the SAME `buildCacheKey(entityName, parsed)`
   * util (D-06 — full request fingerprint). TTL sourced from `options.query.cache`
   * via `getEffectiveTtl` (D-10 — no hard-coded TTL fallback).
   *
   * If `parsed` or `options` is undefined (e.g. legacy callers without request
   * context), the wrap is skipped — fetchFn runs directly. NO 1000ms default.
   */
  private async wrapRead<R>(
    fetchFn: () => Promise<R>,
    parsed?: ParsedRequestParams,
    options?: CrudRequestOptions,
  ): Promise<R> {
    if (!parsed || !options) return fetchFn();
    if (!this.shouldCache(parsed, options)) return fetchFn();
    const ttl = this.getEffectiveTtl(options)!;
    const key = buildCacheKey(this.config.entityName!, parsed);
    return this.withCacheErrorPolicy(
      () => this.getResolvedStrategy()!.wrap(key, fetchFn, ttl),
      fetchFn,
    );
  }

  /**
   * FIX 2 — apply `cacheErrorPolicy` from CrudConfigService.config.query.cacheErrorPolicy.
   * Mirrors the TypeORM/MikroORM/Drizzle helpers exactly.
   */
  private async withCacheErrorPolicy<R>(
    wrapped: () => Promise<R>,
    fetchFn: () => Promise<R>,
  ): Promise<R> {
    try {
      return await wrapped();
    } catch (err) {
      const policy = CrudConfigService.config.query?.cacheErrorPolicy ?? 'fail-fast';
      if (policy === 'fallback-to-source') {
        this.logger.warn?.(
          `cache backend error, falling back to source: ${err instanceof Error ? err.message : String(err)}`,
        );
        return fetchFn();
      }
      throw err;
    }
  }

  /**
   * Extract the per-request TTL from `options.query.cache` (sole production source per D-10).
   * Returns `undefined` when the option is unset, false, or non-positive. Units = MILLISECONDS (FIX 1).
   */
  private getEffectiveTtl(options: CrudRequestOptions): number | undefined {
    const optsCache = options?.query?.cache;
    if (typeof optsCache === 'number' && optsCache > 0) return optsCache;
    return undefined;
  }

  /**
   * Cache predicate. Requires resolved strategy + entityName + positive TTL + bypass NOT explicitly false.
   */
  private shouldCache(parsed: ParsedRequestParams, options: CrudRequestOptions): boolean {
    if (!this.getResolvedStrategy() || !this.config.entityName) return false;
    if (this.getEffectiveTtl(options) === undefined) return false;
    if (parsed.options?.cache === false) return false; // D-13 bypass-read
    if (parsed.cache === 0) return false; // legacy numeric bypass
    return true;
  }

  /**
   * D-11 fail-fast: throw `CrudCacheNotConfiguredError` UNCONDITIONALLY when:
   * - `@Crud cache` is set (positive TTL), AND
   * - consumer did NOT bypass (`?cache=0` or `parsed.options.cache === false`), AND
   * - `cacheStrategy` is undefined.
   *
   * Matches TypeORM/MikroORM/Drizzle behavior. NO "[200, 500] adjust based on".
   */
  private assertStrategyOrPassThrough(parsed?: ParsedRequestParams, options?: CrudRequestOptions): void {
    if (!options) return;
    const ttl = this.getEffectiveTtl(options);
    if (!ttl) return; // no @Crud cache option set; pass-through silently
    const bypassed = parsed?.options?.cache === false || parsed?.cache === 0;
    if (bypassed) return;
    if (!this.getResolvedStrategy()) throw new CrudCacheNotConfiguredError();
  }
}
