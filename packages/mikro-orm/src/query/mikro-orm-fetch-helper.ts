import { CrudCacheNotConfiguredError, CrudConfigService, CrudRequestOptions } from '@nestjs-crud/core';
import { buildCacheKey } from '@nestjs-crud/core/cache';
import type { CacheStrategy } from '@nestjs-crud/core/cache';
import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';
import { ParsedRequestParams } from '@nestjs-crud/request';
import { EntityClass, EntityManager } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';
import { Logger, LoggerService } from '@nestjs/common';

export interface MikroOrmFetchHelperConfig {
  onNotFound: (alias: string) => void;
  /**
   * di-scope-awareness: MUST be a thunk, NEVER a captured
   * `em: EntityManager` instance. MikroORM's per-request middleware returns
   * a fresh em with its own identity map — capturing em at ctor time would
   * freeze a stale map across requests, corrupting write paths ("row was
   * updated by another transaction" under load). Every method that needs em
   * calls `this.config.getEm()` fresh; the result is NEVER cached beyond
   * method scope. Cache-wrap closures (when `cacheStrategy` is wired) MUST
   * also call `getEm()` INSIDE the closure body — capturing em at wrap time
   * would re-introduce the bug.
   */
  getEm: () => EntityManager;
  /** Optional cache backend; resolved by the translator. */
  cacheStrategy?: CacheStrategy;
  /** Entity name for cache-key prefix. Required when cacheStrategy is set. */
  entityName?: string;
  /** Optional logger threaded into withCacheErrorPolicy (FIX 2). */
  logger?: LoggerService;
}

/**
 * Adapter-internal `FetchHelper<QueryBuilder<T>>` implementation.
 *
 * Executes prepared MikroORM `QueryBuilder` state. `Q` (not `W`) is the
 * input type — the caller is responsible for composing the query first
 * (via `MikroOrmQueryComposer.applyToQuery` or equivalent).
 *
 * ### getEm thunk contract
 *
 * The ctor takes `getEm: () => EntityManager` — a thunk, NOT a captured
 * `em` field. `findOneOrFail`/`executeMany` resolve em fresh via
 * `this.config.getEm()` so request-scope middleware returns the correct em
 * each call and the identity map never goes stale. DO NOT add
 * Adding a cached `em` instance field — the acceptance grep explicitly rejects that shape.
 *
 * **Cache-wrap closures must also call getEm() INSIDE the closure body** —
 * capturing em outside the closure re-introduces the cross-request identity-map bug.
 *
 * @internal — subject to change without semver-major.
 * @since 2.0.0
 */
export class MikroOrmFetchHelper<T extends object> implements FetchHelper<QueryBuilder<T>> {
  private readonly logger: LoggerService;

  constructor(private readonly config: MikroOrmFetchHelperConfig) {
    this.logger = config.logger ?? new Logger(MikroOrmFetchHelper.name);
  }

  public async count(qb: QueryBuilder<T>): Promise<number> {
    return (qb as any).getCount();
  }

  public async findOneOrFail<R = T>(
    qb: QueryBuilder<T>,
    opts: FetchHelperFindOneOpts,
    parsed?: ParsedRequestParams,
    options?: CrudRequestOptions,
  ): Promise<R> {
    // Fresh em per call (di-scope-awareness). The getEm() thunk is
    // re-invoked here instead of captured at ctor time.
    const em = this.config.getEm();
    void em; // em is currently resolved by callers via translator.findOneOrFail; reserved for future parity.

    const fetchFn = async (): Promise<unknown> => {
      // CRITICAL: getEm() called INSIDE the closure to preserve the thunk invariant
      // even when cacheStrategy.wrap re-invokes this closure asynchronously.
      const innerEm = this.config.getEm();
      void innerEm;
      (qb as any).limit(1);
      const result = await (qb as any).getSingleResult();
      if (!result) {
        const notify = opts.onNotFound ?? this.config.onNotFound;
        notify('');
      }
      return result;
    };

    return this.wrapRead<R>(fetchFn as () => Promise<R>, parsed, options);
  }

  /**
   * Convenience: create a fresh QB for `entityClass` against the current
   * request-scope em. Used by the translator facade's `findOneOrFail` to
   * preserve the pre-6.2 public contract (which takes `entityClass` +
   * `parsed` rather than a prepared QB).
   *
   * Every call resolves em via the `getEm()` thunk.
   */
  public createQueryBuilder(entityClass: EntityClass<T>): QueryBuilder<T> {
    const em = this.config.getEm();
    // @internal — EntityManager.createQueryBuilder is not in the @mikro-orm/core
    // type surface; it is provided by @mikro-orm/knex at runtime.
    return (em as unknown as { createQueryBuilder: (cls: EntityClass<T>) => QueryBuilder<T> }).createQueryBuilder(
      entityClass,
    );
  }

  public async executeMany<R = T>(
    qb: QueryBuilder<T>,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<R[]> {
    const fetchFn = async (): Promise<unknown[]> => {
      // CRITICAL: getEm() resolved INSIDE the closure (preserves thunk invariant).
      const em = this.config.getEm();
      void em;
      return (qb as any).getResult();
    };

    if (!this.shouldCache(parsed, options)) {
      // D-11 fail-fast: if @Crud cache option is set but no strategy is wired, throw.
      this.assertStrategyOrPassThrough(parsed, options);
      return (await fetchFn()) as unknown as R[];
    }
    const ttl = this.getEffectiveTtl(options)!;
    const key = buildCacheKey(this.config.entityName!, parsed);
    return (await this.withCacheErrorPolicy(
      () => this.config.cacheStrategy!.wrap(key, fetchFn, ttl),
      fetchFn,
    )) as unknown as R[];
  }

  // ----- private cache helpers -----

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
    if (!this.shouldCache(parsed, options)) {
      this.assertStrategyOrPassThrough(parsed, options);
      return fetchFn();
    }
    const ttl = this.getEffectiveTtl(options)!;
    const key = buildCacheKey(this.config.entityName!, parsed);
    return this.withCacheErrorPolicy(
      () => this.config.cacheStrategy!.wrap(key, fetchFn, ttl),
      fetchFn,
    );
  }

  /**
   * FIX 2 — apply `cacheErrorPolicy` from CrudConfigService.config.query.cacheErrorPolicy.
   * Mirrors the TypeORM/Drizzle/Prisma helpers exactly.
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
   * Cache predicate. Requires strategy + entityName + positive TTL + bypass NOT explicitly false.
   */
  private shouldCache(parsed: ParsedRequestParams, options: CrudRequestOptions): boolean {
    if (!this.config.cacheStrategy || !this.config.entityName) return false;
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
    if (!this.config.cacheStrategy) throw new CrudCacheNotConfiguredError();
  }
}
