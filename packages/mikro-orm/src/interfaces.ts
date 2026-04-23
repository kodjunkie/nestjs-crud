import { EntityMetadata, EntityProperty } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';
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
 * Config object for `MikroOrmQueryTranslator`.
 *
 * Note: `em` is intentionally NOT on this interface. The translator ctor takes
 * `getEm: () => EntityManager` as a SEPARATE (first) argument so em is
 * resolved fresh per-call under MikroORM's request-scope middleware.
 * Capturing em in config would freeze a stale identity map across requests
 * (di-scope-awareness — cross-request pollution).
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
  joinResolver: JoinResolver<QueryBuilder<object>>;
}

/**
 * Config object for `MikroOrmJoinResolver`.
 *
 * @since 2.0.0
 */
export interface MikroOrmJoinResolverConfig<T extends object = object> {
  metadata: EntityMetadata<T>;
  onBadRequest: (msg: string) => void;
}
