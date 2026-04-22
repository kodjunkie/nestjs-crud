import type { WhereBuilder } from '@nestjs-crud/core/query';

import type { SCondition } from '@nestjs-crud/request';

/**
 * @internal — subject to change without semver-major.
 * Compiles an SCondition search tree into a Prisma `where` object.
 */

// TYPES-01 debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export interface PrismaWhereBuilderConfig {
  entityColumns: string[];

  relationFields: string[];

  onBadRequest: (msg: string) => void;
}

export class PrismaWhereBuilder implements WhereBuilder<any, Record<string, any>> {
  constructor(private readonly config: PrismaWhereBuilderConfig) {}

  public build(_search: SCondition): Record<string, any> {
    throw new Error('not implemented — Plan 02 PrismaWhereBuilder');
  }
}
