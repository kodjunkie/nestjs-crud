import { getAllowedColumns, JoinOption, JoinOptions, JoinResolver } from '@nestjs-crud/core';
import { QueryJoin } from '@nestjs-crud/request';
import { hasLength, isArrayFull, objKeys } from '@nestjs-crud/util';
import { eq, getTableColumns, getTableName } from 'drizzle-orm';

import { DrizzleAllowedRelation, DrizzleJoinResolverConfig, DrizzleRelationsConfig } from './interfaces';

// TYPES-01 debt: Drizzle's select-builder type surface is unstable across
// versions; adapters pin `any` here and carry the invariant forward.
type AnyDrizzleSelect = any;

/**
 * Resolves eager + client-requested joins for Drizzle CRUD adapters. Ports
 * the inline `applyJoins` logic from `DrizzleCrudService` (v1.x) and exposes
 * `getAllowedColumnsFor` for dotted-path sort allowlist enforcement
 * (D-05b SQLi-guard invariant — Phase 5 Plan 06.5 pattern).
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

    const appliedJoins = new Set<string>();

    // Apply eager joins first
    for (const joinField of allowedJoins) {
      const options = joinOptions[joinField];
      if (options.eager) {
        this.applyJoin(query, joinField, options);
        appliedJoins.add(joinField);
      }
    }

    // Apply requested joins
    if (isArrayFull(joins)) {
      for (const join of joins) {
        if (!appliedJoins.has(join.field) && allowedJoins.includes(join.field)) {
          this.applyJoin(query, join.field, joinOptions[join.field]);
        }
      }
    }

    return query;
  }

  /**
   * Return the allowed column name set for a given relation (or its leaf
   * segment for dotted paths). Returns an empty Set if the relation is
   * unknown — callers must check `.size` and reject before letting the
   * identifier reach the SQL builder. D-05b SQLi mitigation surface.
   *
   * @since 2.0.0
   */
  public getAllowedColumnsFor(field: string): ReadonlySet<string> {
    const rel = this.relationsHash.get(field) ?? this.relationsHash.get(field.split('.')[0]);
    return new Set(rel?.allowedColumns ?? []);
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
