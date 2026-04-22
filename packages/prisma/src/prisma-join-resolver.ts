import type { JoinResolver } from '@nestjs-crud/core';

import type { QueryJoin } from '@nestjs-crud/request';

import type { JoinOptions } from '@nestjs-crud/core';

// TYPES-01 debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export class PrismaJoinResolver implements JoinResolver<any> {
  constructor(
    private readonly config: {
      relationFields: string[];
      allowedColumnsByRelation: Record<string, string[]>;
    },
  ) {}

  public getAllowedColumnsFor(relation: string): ReadonlySet<string> {
    const cols = this.config.allowedColumnsByRelation[relation] ?? [];

    return new Set(cols);
  }

  public applyJoins(_query: any, _joins: QueryJoin[], _joinOptions: JoinOptions): any {
    throw new Error('not implemented — Plan 03 PrismaJoinResolver.applyJoins');
  }
}
