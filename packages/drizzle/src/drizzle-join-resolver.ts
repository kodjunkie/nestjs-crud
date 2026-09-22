import { getAllowedColumns, JoinOption, JoinOptions, JoinResolver } from '@nestjs-crud/core';
import { QueryJoin } from '@nestjs-crud/request';
import { hasLength, isArrayFull, objKeys } from '@nestjs-crud/util';
import { eq, getTableColumns, getTableName } from 'drizzle-orm';

import { DrizzleAllowedRelation, DrizzleJoinResolverConfig, DrizzleRelationsConfig } from './interfaces';

// Type debt: Drizzle's select-builder type surface is unstable across
// versions; adapters pin `any` here and carry the invariant forward.
type AnyDrizzleSelect = any;

/**
 * Return every proper dotted prefix of `field`, shallow to deep.
 *
 * `ancestorPaths('a.b.c')` returns `['a', 'a.b']`.
 * `ancestorPaths('a')` returns `[]`.
 */
function ancestorPaths(field: string): string[] {
  const segments = field.split('.');
  const paths: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    paths.push(segments.slice(0, i).join('.'));
  }

  return paths;
}

/**
 * Given the set of fields being joined, return the first field (in array
 * order) that has a missing ancestor, or `undefined` when every field's
 * ancestors are all present in the same set.
 */
function findOrphanJoin(joinedFields: readonly string[]): string | undefined {
  const joined = new Set(joinedFields);

  for (const field of joinedFields) {
    const missing = ancestorPaths(field).some((ancestor) => !joined.has(ancestor));

    if (missing) {
      return field;
    }
  }

  return undefined;
}

/**
 * Resolves eager + client-requested joins for Drizzle CRUD adapters. Ports
 * the inline `applyJoins` logic from `DrizzleCrudService` (v1.x) and exposes
 * `getAllowedColumnsFor` for dotted-path sort allowlist enforcement
 * (dotted-path sort SQLi-guard invariant).
 *
 * The resolver does NOT import from `drizzle-crud.service.ts` — it receives
 * the relations config via its ctor (arch-avoid-circular-deps invariant).
 *
 * @since 2.0.0
 */
export class DrizzleJoinResolver implements JoinResolver<AnyDrizzleSelect> {
  private readonly relationsConfig: DrizzleRelationsConfig;

  private readonly onBadRequest: (msg: string) => void;

  private readonly relationsHash: Map<string, DrizzleAllowedRelation> = new Map();

  constructor(config: DrizzleJoinResolverConfig) {
    this.relationsConfig = config.relationsConfig;
    this.onBadRequest = config.onBadRequest;
    this.buildRelationsHash();
  }

  public applyJoins(query: AnyDrizzleSelect, joins: QueryJoin[], joinOptions: JoinOptions): AnyDrizzleSelect {
    if (!joinOptions) return query;

    const allowedJoins = objKeys(joinOptions);
    if (!hasLength(allowedJoins)) return query;

    const candidates = this.collectJoinCandidates(joins, joinOptions);

    const orphan = findOrphanJoin(candidates);
    if (orphan) {
      this.onBadRequest(`Invalid join: '${orphan}'`);
      return query;
    }

    const appliedJoins = new Set<string>();

    for (const field of candidates) {
      for (const path of [...ancestorPaths(field), field]) {
        if (!appliedJoins.has(path)) {
          this.applyJoin(query, path, joinOptions[path]);
          appliedJoins.add(path);
        }
      }
    }

    return query;
  }

  /**
   * Return the allowed column name set for a given relation (or its leaf
   * segment for dotted paths). Returns an empty Set if the relation is
   * unknown — callers must check `.size` and reject before letting the
   * identifier reach the SQL builder. SQLi mitigation surface.
   *
   * @since 2.0.0
   */
  public getAllowedColumnsFor(field: string): ReadonlySet<string> {
    const rel = this.relationsHash.get(field) ?? this.relationsHash.get(field.split('.')[0]);
    return new Set(rel?.allowedColumns ?? []);
  }

  /**
   * Build the ordered candidate join-field list: every eager join-option key
   * (in key order), then every requested join field that is a join-option
   * key (in request order), first occurrence wins. This list is also the
   * "joined" set used by the orphan-nested-join ancestry guard.
   */
  private collectJoinCandidates(joins: QueryJoin[], joinOptions: JoinOptions): string[] {
    const allowedJoins = objKeys(joinOptions);
    const candidates: string[] = [];
    const seen = new Set<string>();

    for (const field of allowedJoins) {
      if (joinOptions[field]?.eager && !seen.has(field)) {
        candidates.push(field);
        seen.add(field);
      }
    }

    if (isArrayFull(joins)) {
      for (const join of joins) {
        if (allowedJoins.includes(join.field) && !seen.has(join.field)) {
          candidates.push(join.field);
          seen.add(join.field);
        }
      }
    }

    return candidates;
  }

  private applyJoin(query: AnyDrizzleSelect, field: string, options: JoinOption): void {
    const relationConfig = this.relationsConfig[field];
    if (!relationConfig) {
      return;
    }

    const joinFn = options.required ? 'innerJoin' : 'leftJoin';
    query[joinFn](relationConfig.table, eq(relationConfig.referenceKey, relationConfig.foreignKey));
  }

  private buildRelationsHash(): void {
    for (const [field, relConfig] of Object.entries(this.relationsConfig)) {
      const columnsObj = getTableColumns(relConfig.table) as Record<string, unknown>;
      const columns = Object.keys(columnsObj);
      const primaryColumns: string[] = [];

      for (const [name, col] of Object.entries(columnsObj)) {
        if ((col as any).primary || (col as any).primaryKey) {
          primaryColumns.push(name);
        }
      }

      // Without per-relation JoinOption here, default to the full column set
      // as the allowlist source; per-call JoinOption narrowing happens at
      // applyJoins time. This matches the service's v1.x allowlist scope.
      const allowedColumns = getAllowedColumns(columns, {});

      const nested = field.includes('.');
      const name = nested ? field.split('.').slice(-1)[0] : field;
      const path = relConfig.alias ?? getTableName(relConfig.table);

      const allowed: DrizzleAllowedRelation = {
        name,
        path,
        nested,
        config: relConfig,
        columns,
        primaryColumns,
        allowedColumns,
      };

      this.relationsHash.set(field, allowed);

      // Register by leaf name for dotted-path sort validation
      if (nested && !this.relationsHash.has(name)) {
        this.relationsHash.set(name, allowed);
      }

      if (relConfig.alias && !this.relationsHash.has(relConfig.alias)) {
        this.relationsHash.set(relConfig.alias, allowed);
      }
    }
  }
}
