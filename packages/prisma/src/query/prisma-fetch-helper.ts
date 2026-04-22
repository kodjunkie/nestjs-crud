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

  public async count(qb: any): Promise<number> {
    const delegate = this.config.getDelegate();
    return delegate.count({ where: qb.where });
  }

  public async findOneOrFail<R = unknown>(qb: any, opts: FetchHelperFindOneOpts): Promise<R> {
    const delegate = this.config.getDelegate();
    const { include, select, where } = qb;
    const args: any = { where };
    if (select) {
      args.select = select;
    } else if (include) {
      args.include = include;
    }
    const row = await delegate.findFirst(args);
    if (!row) {
      (opts.onNotFound ?? this.config.onNotFound)('');
    }
    return row as R;
  }

  public async executeMany<R = unknown>(
    qb: any,
    _parsed: ParsedRequestParams,
    _options: CrudRequestOptions,
  ): Promise<R[]> {
    const delegate = this.config.getDelegate();
    return delegate.findMany(qb) as unknown as R[];
  }
}
