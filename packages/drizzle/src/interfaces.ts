import { Column, Table } from 'drizzle-orm';

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
