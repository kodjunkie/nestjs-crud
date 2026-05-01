import type { QueryTranslator } from '@nestjs-crud/core';

import type { CrudRequestOptions } from '@nestjs-crud/core';

import type { ParsedRequestParams, SCondition } from '@nestjs-crud/request';

import { PrismaClientLike, PrismaQueryTranslatorConfig } from './interfaces';

import { PrismaFetchHelper } from './query/prisma-fetch-helper';

import { PrismaQueryComposer } from './query/prisma-query-composer';

import { PrismaWhereBuilder } from './query/prisma-where-builder';

// Type debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export class PrismaQueryTranslator<T extends Record<string, unknown>> implements QueryTranslator<
  any,
  Record<string, any>
> {
  /** @internal — exposed via executeMany/findOneOrFail for cache-path routing. */
  public readonly fetchHelper: PrismaFetchHelper;

  private readonly whereBuilder: PrismaWhereBuilder;

  private readonly queryComposer: PrismaQueryComposer;

  constructor(
    private readonly prisma: PrismaClientLike,
    private readonly modelName: string,
    private readonly config: PrismaQueryTranslatorConfig<T>,
  ) {
    this.whereBuilder = new PrismaWhereBuilder({
      entityColumns: config.entityColumns,
      relationFields: config.relationFields ?? [],
      onBadRequest: config.onBadRequest,
    });
    this.queryComposer = new PrismaQueryComposer({
      entityColumns: config.entityColumns,
      entityPrimaryColumns: config.entityPrimaryColumns,
      entityHasDeleteColumn: config.entityHasDeleteColumn,
      softDeleteColumn: config.softDeleteColumn,
      onBadRequest: config.onBadRequest,
      joinResolver: config.joinResolver,
      whereBuilder: this.whereBuilder,
      relationFields: config.relationFields ?? [],
    });
    this.fetchHelper = new PrismaFetchHelper({
      getDelegate: () => (this.prisma as any)[this.modelName],
      onNotFound: () => undefined,
      cacheStrategy: config.cacheStrategy,
      entityName: config.entityName,
      logger: config.logger,
    });
  }

  public buildWhere(search: SCondition): Record<string, any> | undefined {
    return this.whereBuilder.build(search);
  }

  public applyToQuery(q: any, parsed: ParsedRequestParams, options: CrudRequestOptions): any {
    return this.queryComposer.applyToQuery(q, parsed, options);
  }

  public newQuery(select?: string[]): any {
    // Prisma's "query" is a plain arg object — return a seed with select if provided
    return select?.length ? { select: Object.fromEntries(select.map((c) => [c, true])) } : {};
  }

  public async count(q: any): Promise<number> {
    return (this.prisma as any)[this.modelName].count({ where: q.where });
  }

  /**
   * Execute the composed query through the FetchHelper cache wrap path.
   * When a `cacheStrategy` is wired (via ctor config or CrudConfigService global),
   * the result is wrapped in the strategy — cache-hit returns early, cache-miss
   * executes and sets the result. Bypassed when `?cache=0` or no strategy.
   */
  public async executeMany<R = T>(qb: any, parsed: ParsedRequestParams, options: CrudRequestOptions): Promise<R[]> {
    return this.fetchHelper.executeMany<R>(qb, parsed, options);
  }

  /**
   * Execute a findFirst through the FetchHelper cache wrap path.
   * Routes through the cache wrap when a strategy is wired and the
   * request is not bypassed (D-10 + D-11).
   */
  public async findOneOrFail<R = T>(
    qb: any,
    parsed?: ParsedRequestParams,
    options?: CrudRequestOptions,
  ): Promise<R | null> {
    return (this.fetchHelper as any).findOneOrFail(
      qb,
      { onNotFound: () => undefined },
      parsed,
      options,
    ) as Promise<R | null>;
  }

  /** Transaction scope-clone hook. */
  public cloneFor(tx: PrismaClientLike): PrismaQueryTranslator<T> {
    return new PrismaQueryTranslator<T>(tx, this.modelName, this.config);
  }
}
