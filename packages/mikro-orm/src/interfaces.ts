import { EntityProperty } from '@mikro-orm/core';

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
