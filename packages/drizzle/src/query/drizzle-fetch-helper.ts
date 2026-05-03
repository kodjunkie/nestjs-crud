import { CrudCacheNotConfiguredError, CrudConfigService } from '@nestjs-crud/core';
import { buildCacheKey } from '@nestjs-crud/core/cache';
import type { CacheStrategy } from '@nestjs-crud/core/cache';
import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';
import type { CrudRequestOptions } from '@nestjs-crud/core';
import type { ParsedRequestParams } from '@nestjs-crud/request';
import { Logger, LoggerService } from '@nestjs/common';

// Type debt: Drizzle's $dynamic select-builder type surface is unstable.
type AnyDrizzleSelect = any;

export interface DrizzleFetchHelperConfig {
  onNotFound: (alias: string) => void;
  /** Optional cache backend; resolved by the translator. */
  cacheStrategy?: CacheStrategy;
  /** Entity name for cache-key prefix. Required when cacheStrategy is set. */
  entityName?: string;
  /** Optional logger threaded into withCacheErrorPolicy (FIX 2). */
  logger?: LoggerService;
}

/**
 * Adapter-internal `FetchHelper<AnyDrizzleSelect>` implementation.
 *
 * Executes prepared Drizzle `$dynamic()` builder state. `Q` (not `W`) is
 * the input type — the caller is responsible for composing the query
 * first (via `DrizzleQueryComposer.applyToQuery` or equivalent).
 *
 * @internal — subject to change without semver-major.
 * @since 2.0.0
 */
export class DrizzleFetchHelper implements FetchHelper<AnyDrizzleSelect> {
  private readonly logger: LoggerService;

  constructor(private readonly config: DrizzleFetchHelperConfig) {
    this.logger = config.logger ?? new Logger(DrizzleFetchHelper.name);
  }

  public async count(qb: AnyDrizzleSelect): Promise<number> {
    const result = await qb;
    return Number(result[0]?.count ?? 0);
  }

  public async findOneOrFail<R = unknown>(
    qb: AnyDrizzleSelect,
    opts: FetchHelperFindOneOpts,
    parsed?: ParsedRequestParams,
    options?: CrudRequestOptions,
  ): Promise<R> {
    const fetchFn = async (): Promise<unknown> => {
      qb.limit(1);
      const results = (await qb) as any[];
      const found = results[0];
      if (!found) {
        const notify = opts.onNotFound ?? this.config.onNotFound;
        notify('');
      }
      return found;
    };

    return this.wrapRead<R>(fetchFn as () => Promise<R>, parsed, options);
  }

  public async executeMany<R = unknown>(
    qb: AnyDrizzleSelect,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<R[]> {
    const fetchFn = async (): Promise<unknown[]> => (await qb) as unknown as unknown[];

    if (!this.shouldCache(parsed, options)) {
      // D-11 fail-fast: if @Crud cache option is set but no strategy is wired, throw.
      this.assertStrategyOrPassThrough(parsed, options);
      return (await fetchFn()) as unknown as R[];
    }

    const strategy = this.getResolvedStrategy()!;
    const ttl = this.getEffectiveTtl(options)!;
    const key = buildCacheKey(this.config.entityName!, parsed);
    return (await this.withCacheErrorPolicy(() => strategy.wrap(key, fetchFn, ttl), fetchFn)) as unknown as R[];
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
   * Internal cache wrapper used by `findOneOrFail`. Both reads derive the cache
   * key from the SAME `buildCacheKey(entityName, parsed)` util (D-06 — full request
   * fingerprint). TTL sourced from `options.query.cache` via `getEffectiveTtl`
   * (D-10 — no hard-coded TTL fallback).
   *
   * If `parsed` or `options` is undefined (legacy callers without request context),
   * the wrap is SKIPPED — fetchFn runs directly. NO 1000ms default.
   */
  private async wrapRead<R>(
    fetchFn: () => Promise<R>,
    parsed?: ParsedRequestParams,
    options?: CrudRequestOptions,
  ): Promise<R> {
    if (!parsed || !options) return fetchFn();
    if (!this.shouldCache(parsed, options)) {
      this.assertStrategyOrPassThrough(parsed, options);
      return fetchFn();
    }
    const strategy = this.getResolvedStrategy()!;
    const ttl = this.getEffectiveTtl(options)!;
    const key = buildCacheKey(this.config.entityName!, parsed);
    return this.withCacheErrorPolicy(() => strategy.wrap(key, fetchFn, ttl), fetchFn);
  }

  /**
   * FIX 2 — apply `cacheErrorPolicy` from CrudConfigService.config.query.cacheErrorPolicy.
   * Mirrors the TypeORM/MikroORM/Prisma helpers exactly.
   */
  private async withCacheErrorPolicy<R>(wrapped: () => Promise<R>, fetchFn: () => Promise<R>): Promise<R> {
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
   * Cache predicate. Requires resolved strategy + entityName + positive TTL + bypass NOT explicitly set.
   */
  private shouldCache(parsed: ParsedRequestParams, options: CrudRequestOptions): boolean {
    if (!this.getResolvedStrategy() || !this.config.entityName) return false;
    if (this.getEffectiveTtl(options) === undefined) return false;
    if (parsed.options?.cache === false) return false; // D-13 bypass-read
    if (parsed.cache === 0) return false; // legacy numeric bypass
    return true;
  }

  /**
   * D-11 fail-fast: if the consumer set `@Crud({ query: { cache } })` but did NOT
   * wire a strategy, throw `CrudCacheNotConfiguredError`. Mirrors TypeORM behavior.
   * Skips the throw when bypass is requested (consumer explicitly opted out for this read).
   */
  private assertStrategyOrPassThrough(parsed: ParsedRequestParams, options: CrudRequestOptions): void {
    const ttl = this.getEffectiveTtl(options);
    if (!ttl) return; // no @Crud cache option set; pass-through silently
    if (parsed.options?.cache === false || parsed.cache === 0) return; // bypass requested
    if (!this.getResolvedStrategy()) throw new CrudCacheNotConfiguredError();
  }
}
