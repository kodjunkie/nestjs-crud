import type { JoinOptions, JoinResolver } from '@nestjs-crud/core';

import type { QueryJoin } from '@nestjs-crud/request';

// TYPES-01 debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export interface PrismaJoinResolverConfig {
  relationFields: string[];

  allowedColumnsByRelation: Record<string, string[]>;
}

/**
 * Resolves relation allowlists for PrismaQueryComposer's D-05b SQLi guard.
 *
 * Prisma uses `include` (not SQL JOIN) for relation traversal, so `applyJoins`
 * is intentionally not needed here — include blocks are assembled inside
 * `PrismaQueryComposer.getIncludeObject`. This resolver's job is purely to
 * provide the dotted-path sort allowlist (D-05b mitigation surface).
 *
 * @since 2.0.0
 */
export class PrismaJoinResolver implements JoinResolver<any> {
  constructor(private readonly config: PrismaJoinResolverConfig) {}

  /**
   * Return the allowed column name set for a given relation name.
   * Returns an empty Set for unknown relations — callers must check `.size`
   * and reject before any identifier reaches Prisma's orderBy.
   * D-05b SQLi mitigation surface.
   */
  public getAllowedColumnsFor(relation: string): ReadonlySet<string> {
    const cols = this.config.allowedColumnsByRelation[relation] ?? [];

    return new Set(cols);
  }

  /**
   * Returns true if the relation name is in the known relation fields list.
   */
  public isKnownRelation(relation: string): boolean {
    return this.config.relationFields.includes(relation);
  }

  /**
   * Not needed for Prisma — relation navigation happens via `include` in
   * PrismaQueryComposer, not via SQL JOIN. This method satisfies the
   * JoinResolver interface contract but is never called by the Prisma adapter.
   *
   * @internal
   */
  /* istanbul ignore next */
  public applyJoins(_query: any, _joins: QueryJoin[], _joinOptions: JoinOptions): any {
    throw new Error('not needed for Prisma — relation navigation happens via include in PrismaQueryComposer');
  }
}
