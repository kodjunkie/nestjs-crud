import { ComparisonOperator } from '@nestjs-crud/request';
import { raw } from '@mikro-orm/core';

import { DbDialect } from './interfaces';

/**
 * Maps a CRUD comparison operator to a MikroORM FilterQuery fragment.
 *
 * For case-insensitive operators, uses MikroORM's `raw()` to produce
 * properly escaped SQL expressions with LOWER().
 */
export function mapOperator(
  field: string,
  operator: ComparisonOperator | string,
  value: any,
  dialect: DbDialect,
): any {
  const op = operator.startsWith('$') ? operator : `$${operator}`;

  switch (op) {
    case '$eq':
      return { $eq: value };
    case '$ne':
      return { $ne: value };
    case '$gt':
      return { $gt: value };
    case '$lt':
      return { $lt: value };
    case '$gte':
      return { $gte: value };
    case '$lte':
      return { $lte: value };
    case '$in':
      return { $in: value };
    case '$notin':
      return { $nin: value };
    case '$cont':
      return { $like: `%${value}%` };
    case '$excl':
      return { $not: { $like: `%${value}%` } };
    case '$starts':
      return { $like: `${value}%` };
    case '$ends':
      return { $like: `%${value}` };
    case '$isnull':
      return null;
    case '$notnull':
      return { $ne: null };
    case '$between':
      return { $gte: value[0], $lte: value[1] };
    case '$contL':
      return dialect === 'postgresql'
        ? { $ilike: `%${value}%` }
        : raw(`LOWER(??) LIKE ?`, [field, `%${String(value).toLowerCase()}%`]);
    case '$exclL':
      return dialect === 'postgresql'
        ? { $not: { $ilike: `%${value}%` } }
        : raw(`LOWER(??) NOT LIKE ?`, [field, `%${String(value).toLowerCase()}%`]);
    case '$startsL':
      return dialect === 'postgresql'
        ? { $ilike: `${value}%` }
        : raw(`LOWER(??) LIKE ?`, [field, `${String(value).toLowerCase()}%`]);
    case '$endsL':
      return dialect === 'postgresql'
        ? { $ilike: `%${value}` }
        : raw(`LOWER(??) LIKE ?`, [field, `%${String(value).toLowerCase()}`]);
    case '$eqL':
      return raw(`LOWER(??) = ?`, [field, String(value).toLowerCase()]);
    case '$neL':
      return raw(`LOWER(??) != ?`, [field, String(value).toLowerCase()]);
    case '$inL':
      return raw(
        `LOWER(??) IN (${(value as any[]).map(() => '?').join(', ')})`,
        [field, ...(value as any[]).map((v: any) => String(v).toLowerCase())],
      );
    case '$notinL':
      return raw(
        `LOWER(??) NOT IN (${(value as any[]).map(() => '?').join(', ')})`,
        [field, ...(value as any[]).map((v: any) => String(v).toLowerCase())],
      );
    default:
      throw new Error(`Unknown operator: ${op}`);
  }
}
