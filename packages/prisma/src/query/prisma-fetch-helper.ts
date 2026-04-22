import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';

import type { ParsedRequestParams } from '@nestjs-crud/request';

import type { CrudRequestOptions } from '@nestjs-crud/core';

/**
 * @internal — subject to change without semver-major.
 * Executes prepared Prisma arg-object queries: count, findOne, executeMany.
 */

// TYPES-01 debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export interface PrismaFetchHelperConfig {
  // thunk — matches MikroORM's getEm pattern; protects against stale references across $transaction scopes
  getDelegate: () => any;

  onNotFound: (alias: string) => void;
}

export class PrismaFetchHelper implements FetchHelper<any> {
  constructor(private readonly config: PrismaFetchHelperConfig) {}

  public async count(_qb: any): Promise<number> {
    throw new Error('not implemented — Plan 04');
  }

  public async findOneOrFail<R = unknown>(_qb: any, _opts: FetchHelperFindOneOpts): Promise<R> {
    throw new Error('not implemented — Plan 04');
  }

  public async executeMany<R = unknown>(
    _qb: any,
    _parsed: ParsedRequestParams,
    _options: CrudRequestOptions,
  ): Promise<R[]> {
    throw new Error('not implemented — Plan 04');
  }
}
