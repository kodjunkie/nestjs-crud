import { EntityProperty } from '@mikro-orm/core';
import type { JoinResolver } from '@nestjs-crud/core';

export type DbDialect = 'postgresql' | 'mysql' | 'sqlite' | 'mongo' | 'mssql';

export interface MikroOrmAllowedRelation {
  name: string;
  path: string;
  nested: boolean;
  columns: string[];
  primaryColumns: string[];
  allowedColumns: string[];
  prop: EntityProperty;
}

/**
 * Config object for `MikroOrmQueryTranslator` (Phase 6 ARCH-05 Pattern 1).
 *
 * Note: `em` is intentionally NOT on this interface. The translator ctor takes
 * `getEm: () => EntityManager` as a SEPARATE (first) argument so em is
 * resolved fresh per-call under MikroORM's request-scope middleware.
 * Capturing em in config would freeze a stale identity map across requests
 * (di-scope-awareness — cross-request pollution / T-06-02).
 *
 * @since 2.0.0
 */
export interface MikroOrmQueryTranslatorConfig<_T extends object> {
  entityColumns: string[];
  entityPrimaryColumns: string[];
  propertiesMap: Record<string, EntityProperty>;
  entityHasDeleteColumn: boolean;
  softDeleteColumn: string | null;
  dbDialect: DbDialect;
  onBadRequest: (msg: string) => void;
  joinResolver: JoinResolver<any>;
}

/**
 * Config object for `MikroOrmJoinResolver`.
 *
 * `metadata` is the per-entity EntityMetadata surface from MikroORM; kept
 * `unknown` here until TYPES-02 (Phase 8) lifts the typing.
 *
 * @since 2.0.0
 */
export interface MikroOrmJoinResolverConfig {
  metadata: unknown;
  onBadRequest: (msg: string) => void;
}
