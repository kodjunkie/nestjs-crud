import { Column, Table } from 'drizzle-orm';
import type { JoinResolver } from '@nestjs-crud/core';

/**
 * Configuration for a single relation that the DrizzleCrudService can join.
 */
export interface DrizzleRelationConfig {
  /** The related Drizzle table object */
  table: Table;
  /** FK column on the related table (e.g., posts.authorId) */
  foreignKey: Column;
  /** PK/referenced column on the parent table (e.g., users.id) */
  referenceKey: Column;
  /** Optional alias for the joined table */
  alias?: string;
}

/**
 * Map of relation field paths to their configuration.
 * Supports nested relations via dot-notation keys (e.g., 'posts.comments').
 */
export interface DrizzleRelationsConfig {
  [field: string]: DrizzleRelationConfig;
}

/**
 * Internal representation of an allowed relation, enriched with metadata
 * discovered during construction.
 */
export interface DrizzleAllowedRelation {
  name: string;
  path: string;
  nested: boolean;
  config: DrizzleRelationConfig;
  columns: string[];
  primaryColumns: string[];
  allowedColumns: string[];
}

/**
 * Configuration for the DrizzleQueryTranslator.
 * Introduced in v2.0.0 (Phase 6 ARCH-05 Plan 03). Mirrors
 * `TypeOrmQueryTranslatorConfig` (Phase 5) — the translator receives all
 * entity-shape inputs via this config to avoid any runtime or type-only
 * import from `drizzle-crud.service.ts` (arch-avoid-circular-deps).
 *
 * @since 2.0.0
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface DrizzleQueryTranslatorConfig<_T extends Record<string, unknown>> {
  entityColumns: string[];

  entityPrimaryColumns: string[];

  columnsMap: Record<string, Column>;

  entityHasDeleteColumn: boolean;

  softDeleteColumn: Column | null;

  dbDialect: 'pg' | 'mysql' | 'sqlite' | string;

  onBadRequest: (msg: string) => void;

  joinResolver: JoinResolver<any>;
}

/**
 * Configuration for the DrizzleJoinResolver.
 * @since 2.0.0
 */
export interface DrizzleJoinResolverConfig {
  relationsConfig: DrizzleRelationsConfig;

  onBadRequest: (msg: string) => void;
}
