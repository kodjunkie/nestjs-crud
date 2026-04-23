import { mapOperator, PrismaOp } from '../src/operators';

describe('mapOperator', () => {
  const cases: Array<[string, PrismaOp]> = [
    ['$eq', { key: 'equals' }],
    ['$ne', { key: 'not' }],
    ['$gt', { key: 'gt' }],
    ['$gte', { key: 'gte' }],
    ['$lt', { key: 'lt' }],
    ['$lte', { key: 'lte' }],
    ['$starts', { key: 'startsWith' }],
    ['$ends', { key: 'endsWith' }],
    ['$cont', { key: 'contains' }],
    ['$excl', { key: 'contains', negate: true }],
    ['$startsL', { key: 'startsWith', mode: 'insensitive' }],
    ['$endsL', { key: 'endsWith', mode: 'insensitive' }],
    ['$contL', { key: 'contains', mode: 'insensitive' }],
    ['$eqL', { key: 'equals', mode: 'insensitive' }],
    ['$neL', { key: 'equals', mode: 'insensitive', negate: true }],
    ['$exclL', { key: 'contains', mode: 'insensitive', negate: true }],
    ['$in', { key: 'in' }],
    ['$notin', { key: 'notIn' }],
    ['$isnull', { key: 'isnull' }],
    ['$notnull', { key: 'notnull' }],
    ['$between', { key: 'between', expand: 'between' }],
  ];

  it.each(cases)('maps %s correctly', (op, expected) => {
    expect(mapOperator(op)).toEqual(expected);
  });

  describe('$inL — native Prisma in, NO mode modifier, NO OR expansion', () => {
    it('maps $inL to { key: "in" } with no mode and no expand', () => {
      const result = mapOperator('$inL');
      expect(result).toEqual({ key: 'in' });
      expect(result).not.toHaveProperty('mode');
      expect(result).not.toHaveProperty('expand');
    });
  });

  describe('$notinL — native Prisma notIn, NO mode modifier, NO AND expansion', () => {
    it('maps $notinL to { key: "notIn" } with no mode and no expand', () => {
      const result = mapOperator('$notinL');
      expect(result).toEqual({ key: 'notIn' });
      expect(result).not.toHaveProperty('mode');
      expect(result).not.toHaveProperty('expand');
    });
  });

  it('returns null for unknown operator', () => {
    expect(mapOperator('$unknown')).toBeNull();
  });
});
