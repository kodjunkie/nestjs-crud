import {
  Column,
  SQL,
  eq,
  ne,
  gt,
  lt,
  gte,
  lte,
  like,
  ilike,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  between,
  not,
  sql,
} from 'drizzle-orm';
import { ComparisonOperator } from '@nestjs-crud/crud-request';

type DbDialect = 'pg' | 'mysql' | 'sqlite' | string;

/**
 * Maps a CRUD comparison operator to a Drizzle ORM SQL condition.
 */
export function mapOperator(
  column: Column,
  operator: ComparisonOperator | string,
  value: any,
  dialect: DbDialect,
): SQL {
  const op = operator.startsWith('$') ? operator : `$${operator}`;

  switch (op) {
    case '$eq':
      return eq(column, value);
    case '$ne':
      return ne(column, value);
    case '$gt':
      return gt(column, value);
    case '$lt':
      return lt(column, value);
    case '$gte':
      return gte(column, value);
    case '$lte':
      return lte(column, value);
    case '$starts':
      return like(column, `${value}%`);
    case '$ends':
      return like(column, `%${value}`);
    case '$cont':
      return like(column, `%${value}%`);
    case '$excl':
      return not(like(column, `%${value}%`));
    case '$startsL':
      return dialect === 'pg' ? ilike(column, `${value}%`) : sql`LOWER(${column}) LIKE LOWER(${`${value}%`})`;
    case '$endsL':
      return dialect === 'pg' ? ilike(column, `%${value}`) : sql`LOWER(${column}) LIKE LOWER(${`%${value}`})`;
    case '$contL':
      return dialect === 'pg' ? ilike(column, `%${value}%`) : sql`LOWER(${column}) LIKE LOWER(${`%${value}%`})`;
    case '$exclL':
      return dialect === 'pg'
        ? not(ilike(column, `%${value}%`))
        : sql`LOWER(${column}) NOT LIKE LOWER(${`%${value}%`})`;
    case '$eqL':
      return sql`LOWER(${column}) = LOWER(${value})`;
    case '$neL':
      return sql`LOWER(${column}) != LOWER(${value})`;
    case '$in':
      return inArray(column, value);
    case '$notin':
      return notInArray(column, value);
    case '$inL':
      return sql`LOWER(${column}) IN (${sql.join(
        value.map((v: string) => sql`LOWER(${v})`),
        sql`, `,
      )})`;
    case '$notinL':
      return sql`LOWER(${column}) NOT IN (${sql.join(
        value.map((v: string) => sql`LOWER(${v})`),
        sql`, `,
      )})`;
    case '$isnull':
      return isNull(column);
    case '$notnull':
      return isNotNull(column);
    case '$between':
      return between(column, value[0], value[1]);
    default:
      throw new Error(`Unsupported operator: ${op}`);
  }
}
