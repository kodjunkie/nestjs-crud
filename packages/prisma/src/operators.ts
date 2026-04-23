/**
 * Maps a nestjs-crud SCondition operator token to a Prisma filter descriptor.
 *
 * `$inL`/`$notinL` map to native Prisma `in`/`notIn` — NO `mode: 'insensitive'`
 * and NO OR/AND expansion. Per spike Pattern 5 + Constraint C5: `mode` is a
 * per-string-operator modifier (startsWith, endsWith, contains, equals) and is
 * NOT valid on array filters.
 */
export interface PrismaOp {
  key: string;

  mode?: 'insensitive';

  negate?: boolean;

  expand?: 'between';
}

export function mapOperator(sOp: string): PrismaOp | null {
  switch (sOp) {
    case '$eq':
      return { key: 'equals' };

    case '$ne':
      return { key: 'not' };

    case '$gt':
      return { key: 'gt' };

    case '$gte':
      return { key: 'gte' };

    case '$lt':
      return { key: 'lt' };

    case '$lte':
      return { key: 'lte' };

    case '$starts':
      return { key: 'startsWith' };

    case '$ends':
      return { key: 'endsWith' };

    case '$cont':
      return { key: 'contains' };

    case '$excl':
      return { key: 'contains', negate: true };

    case '$startsL':
      return { key: 'startsWith', mode: 'insensitive' };

    case '$endsL':
      return { key: 'endsWith', mode: 'insensitive' };

    case '$contL':
      return { key: 'contains', mode: 'insensitive' };

    case '$eqL':
      return { key: 'equals', mode: 'insensitive' };

    case '$neL':
      return { key: 'equals', mode: 'insensitive', negate: true };

    case '$exclL':
      return { key: 'contains', mode: 'insensitive', negate: true };

    case '$in':
      return { key: 'in' };

    case '$notin':
      return { key: 'notIn' };

    // Per spike C5 + Pattern 5: native Prisma in/notIn — NO mode modifier, NO expansion
    case '$inL':
      return { key: 'in' };

    // Per spike C5 + Pattern 5: native Prisma in/notIn — NO mode modifier, NO expansion
    case '$notinL':
      return { key: 'notIn' };

    case '$isnull':
      return { key: 'isnull' };

    case '$notnull':
      return { key: 'notnull' };

    case '$between':
      return { key: 'between', expand: 'between' };

    default:
      return null;
  }
}
