import type { CacheStrategy } from '@nestjs-crud/core/cache';
import { buildCacheKey } from '@nestjs-crud/core/cache';
import { CrudConfigService } from '@nestjs-crud/core';
import type { CrudRequestOptions } from '@nestjs-crud/core';
import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';
import type { ParsedRequestParams } from '@nestjs-crud/request';
import { Logger, LoggerService } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export interface TypeOrmFetchHelperConfig {
  onNotFound: (alias: string) => void;
  /** Optional cache backend; resolved by the translator from ctor or CrudConfigService global. */
  cacheStrategy?: CacheStrategy;
  /** Entity name for cache-key prefix. Required when cacheStrategy is set. */
  entityName?: string;
  /** Optional logger used by `withCacheErrorPolicy` to record fallback-to-source events. */
  logger?: LoggerService;
}

/**
 * Adapter-internal `FetchHelper<SelectQueryBuilder<T>>` implementation.
 *
 * Executes prepared `SelectQueryBuilder` state. `Q` (not `W`) is the
 * input type — the caller is responsible for composing the query first
 * (via `TypeOrmQueryComposer.applyToQuery` or equivalent).
 *
 * @internal — subject to change without semver-major.
 * @since 2.0.0
 */
export class TypeOrmFetchHelper<T extends ObjectLiteral> implements FetchHelper<SelectQueryBuilder<T>> {
  private readonly onNotFound: (alias: string) => void;

  private readonly logger: LoggerService;

  constructor(private readonly config: TypeOrmFetchHelperConfig) {
    this.onNotFound = config.onNotFound;
    this.logger = config.logger ?? new Logger(TypeOrmFetchHelper.name);
  }

  public count(qb: SelectQueryBuilder<T>): Promise<number> {
    return qb.getCount();
  }

  public async findOneOrFail<R = T>(
    qb: SelectQueryBuilder<T>,
    opts: FetchHelperFindOneOpts,
    parsed?: ParsedRequestParams,
    options?: CrudRequestOptions,
  ): Promise<R> {
    const { withDeleted = false, onNotFound } = opts;
    const fetchFn = (): Promise<T | null> =>
      withDeleted ? qb.withDeleted().getOne() : qb.getOne();

    const found = await this.wrapRead(fetchFn, parsed, options);
    if (!found) {
      const notify = onNotFound ?? this.onNotFound;
      notify(qb.alias);
    }
    return found as unknown as R;
  }

  public async executeMany<R = T>(
    qb: SelectQueryBuilder<T>,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<R[]> {
    const fetchFn = (): Promise<T[]> => qb.getMany();
    if (!this.shouldCache(parsed, options)) {
      return (await fetchFn()) as unknown as R[];
    }
    const ttl = this.getEffectiveTtl(options)!;
    const key = buildCacheKey(this.config.entityName!, parsed);
    return (await this.withCacheErrorPolicy(
      () => this.config.cacheStrategy!.wrap(key, fetchFn, ttl),
      fetchFn,
    )) as unknown as R[];
  }

  /**
   * Internal cache wrapper used by both `executeMany` and `findOneOrFail`.
   * Both methods derive the cache key from the SAME `buildCacheKey(entityName, parsed)`
   * util (D-06 — full request fingerprint). TTL sourced from `options.query.cache`
   * via `getEffectiveTtl` (D-10 — no hard-coded TTL fallback).
   *
   * If `parsed` or `options` is undefined (e.g. legacy callers without request
   * context), the wrap is skipped — fetchFn runs directly.
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
      () => this.config.cacheStrategy!.wrap(key, fetchFn, ttl),
      fetchFn,
    );
  }

  /**
   * Apply `cacheErrorPolicy` from CrudConfigService.config.query.cacheErrorPolicy.
   * - `'fail-fast'` (default): propagate the wrap error.
   * - `'fallback-to-source'`: log a warning and call `fetchFn()` directly so the
   *   request still succeeds when Redis (or whatever backend) is down.
   *
   * Pattern shared verbatim across all 4 adapter FetchHelpers (TypeORM/MikroORM/
   * Drizzle/Prisma) — keep the implementation in lock-step.
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
   * Returns `undefined` when the option is unset, false, or non-positive. Units = MILLISECONDS.
   */
  private getEffectiveTtl(options: CrudRequestOptions): number | undefined {
    const optsCache = options?.query?.cache;
    if (typeof optsCache === 'number' && optsCache > 0) return optsCache;
    return undefined;
  }

  /**
   * Cache predicate: requires a strategy, an entityName, a positive TTL,
   * and that the per-request bypass flag is NOT explicitly false (D-13).
   * The legacy numeric `parsed.cache === 0` check is preserved as a fallback
   * for clients that haven't migrated to the new `parsed.options.cache` boolean.
   */
  private shouldCache(parsed: ParsedRequestParams, options: CrudRequestOptions): boolean {
    if (!this.config.cacheStrategy || !this.config.entityName) return false;
    if (this.getEffectiveTtl(options) === undefined) return false;
    if (parsed.options?.cache === false) return false; // D-13 bypass-read
    if (parsed.cache === 0) return false; // legacy numeric bypass
    return true;
  }
}
