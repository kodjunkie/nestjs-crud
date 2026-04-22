import type { QueryTranslator } from '@nestjs-crud/core';

import type { CrudRequestOptions } from '@nestjs-crud/core';

import type { ParsedRequestParams, SCondition } from '@nestjs-crud/request';

import { PrismaClientLike, PrismaQueryTranslatorConfig } from './interfaces';

import { PrismaFetchHelper } from './query/prisma-fetch-helper';

import { PrismaQueryComposer } from './query/prisma-query-composer';

import { PrismaWhereBuilder } from './query/prisma-where-builder';

// TYPES-01 debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export class PrismaQueryTranslator<T extends Record<string, unknown>>
  implements QueryTranslator<any, Record<string, any>>
{
  private readonly whereBuilder: PrismaWhereBuilder;

  private readonly queryComposer: PrismaQueryComposer;

  private readonly fetchHelper: PrismaFetchHelper;

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
    });
  }

  public buildWhere(_search: SCondition): Record<string, any> | undefined {
    throw new Error('not implemented — Plan 02');
  }

  public applyToQuery(_q: any, _parsed: ParsedRequestParams, _options: CrudRequestOptions): any {
    throw new Error('not implemented — Plan 03');
  }

  public newQuery(select?: string[]): any {
    // Prisma's "query" is a plain arg object — return a seed with select if provided
    return select?.length ? { select: Object.fromEntries(select.map((c) => [c, true])) } : {};
  }

  public async count(_q: any): Promise<number> {
    throw new Error('not implemented — Plan 04');
  }

  /** SEC-03 scope-clone hook (Plan 04 will implement). */
  public cloneFor(tx: PrismaClientLike): PrismaQueryTranslator<T> {
    return new PrismaQueryTranslator<T>(tx, this.modelName, this.config);
  }
}
