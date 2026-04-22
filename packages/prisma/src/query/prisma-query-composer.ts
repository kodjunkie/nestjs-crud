import type { QueryComposer, WhereBuilder } from '@nestjs-crud/core/query';

import type { ParsedRequestParams } from '@nestjs-crud/request';

import type { CrudRequestOptions, JoinResolver } from '@nestjs-crud/core';

/**
 * @internal — subject to change without semver-major.
 * Applies WHERE + sort + pagination + field selection + soft-delete + eager joins to a Prisma arg object.
 */

// TYPES-01 debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export interface PrismaQueryComposerConfig {
  entityColumns: string[];

  entityPrimaryColumns: string[];

  entityHasDeleteColumn: boolean;

  softDeleteColumn: string | null;

  onBadRequest: (msg: string) => void;

  joinResolver: JoinResolver<any>;

  whereBuilder: WhereBuilder<any, Record<string, any>>;

  relationFields: string[];
}

export class PrismaQueryComposer implements QueryComposer<any> {
  constructor(private readonly config: PrismaQueryComposerConfig) {}

  public applyToQuery(_qb: any, _parsed: ParsedRequestParams, _options: CrudRequestOptions): any {
    throw new Error('not implemented — Plan 03 PrismaQueryComposer');
  }
}
