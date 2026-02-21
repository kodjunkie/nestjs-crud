import { mapOperator } from '../src/operators';

describe('mapOperator', () => {
  const field = 'name';

  it('should map $eq', () => {
    const result = mapOperator(field, '$eq', 'John', 'postgresql');
    expect(result).toEqual({ $eq: 'John' });
  });

  it('should map $ne', () => {
    const result = mapOperator(field, '$ne', 'John', 'postgresql');
    expect(result).toEqual({ $ne: 'John' });
  });

  it('should map $gt', () => {
    const result = mapOperator('age', '$gt', 18, 'postgresql');
    expect(result).toEqual({ $gt: 18 });
  });

  it('should map $lt', () => {
    const result = mapOperator('age', '$lt', 18, 'postgresql');
    expect(result).toEqual({ $lt: 18 });
  });

  it('should map $gte', () => {
    const result = mapOperator('age', '$gte', 18, 'postgresql');
    expect(result).toEqual({ $gte: 18 });
  });

  it('should map $lte', () => {
    const result = mapOperator('age', '$lte', 18, 'postgresql');
    expect(result).toEqual({ $lte: 18 });
  });

  it('should map $in', () => {
    const result = mapOperator(field, '$in', ['a', 'b'], 'postgresql');
    expect(result).toEqual({ $in: ['a', 'b'] });
  });

  it('should map $notin', () => {
    const result = mapOperator(field, '$notin', ['a', 'b'], 'postgresql');
    expect(result).toEqual({ $nin: ['a', 'b'] });
  });

  it('should map $cont (LIKE %val%)', () => {
    const result = mapOperator(field, '$cont', 'John', 'postgresql');
    expect(result).toEqual({ $like: '%John%' });
  });

  it('should map $excl (NOT LIKE %val%)', () => {
    const result = mapOperator(field, '$excl', 'John', 'postgresql');
    expect(result).toEqual({ $not: { $like: '%John%' } });
  });

  it('should map $starts (LIKE val%)', () => {
    const result = mapOperator(field, '$starts', 'John', 'postgresql');
    expect(result).toEqual({ $like: 'John%' });
  });

  it('should map $ends (LIKE %val)', () => {
    const result = mapOperator(field, '$ends', 'John', 'postgresql');
    expect(result).toEqual({ $like: '%John' });
  });

  it('should map $isnull', () => {
    const result = mapOperator(field, '$isnull', true, 'postgresql');
    expect(result).toBeNull();
  });

  it('should map $notnull', () => {
    const result = mapOperator(field, '$notnull', true, 'postgresql');
    expect(result).toEqual({ $ne: null });
  });

  it('should map $between', () => {
    const result = mapOperator('age', '$between', [18, 65], 'postgresql');
    expect(result).toEqual({ $gte: 18, $lte: 65 });
  });

  it('should map $contL on postgresql (ilike)', () => {
    const result = mapOperator(field, '$contL', 'John', 'postgresql');
    expect(result).toEqual({ $ilike: '%John%' });
  });

  it('should map $contL on mysql (raw LOWER)', () => {
    const result = mapOperator(field, '$contL', 'John', 'mysql');
    expect(result).toBeDefined();
  });

  it('should map $startsL on postgresql', () => {
    const result = mapOperator(field, '$startsL', 'John', 'postgresql');
    expect(result).toEqual({ $ilike: 'John%' });
  });

  it('should map $endsL on postgresql', () => {
    const result = mapOperator(field, '$endsL', 'John', 'postgresql');
    expect(result).toEqual({ $ilike: '%John' });
  });

  it('should map $exclL on postgresql', () => {
    const result = mapOperator(field, '$exclL', 'John', 'postgresql');
    expect(result).toEqual({ $not: { $ilike: '%John%' } });
  });

  it('should map $eqL', () => {
    const result = mapOperator(field, '$eqL', 'John', 'postgresql');
    expect(result).toBeDefined();
    expect(typeof result).not.toBe('string');
  });

  it('should map $neL', () => {
    const result = mapOperator(field, '$neL', 'John', 'postgresql');
    expect(result).toBeDefined();
    expect(typeof result).not.toBe('string');
  });

  it('should map $inL', () => {
    const result = mapOperator(field, '$inL', ['a', 'b'], 'postgresql');
    expect(result).toBeDefined();
    expect(typeof result).not.toBe('string');
  });

  it('should map $notinL', () => {
    const result = mapOperator(field, '$notinL', ['a', 'b'], 'postgresql');
    expect(result).toBeDefined();
    expect(typeof result).not.toBe('string');
  });

  it('should map legacy operators without $ prefix', () => {
    const result = mapOperator(field, 'eq' as any, 'John', 'postgresql');
    expect(result).toEqual({ $eq: 'John' });
  });

  it('should throw for unknown operator', () => {
    expect(() => mapOperator(field, '$unknown' as any, 'val', 'postgresql')).toThrow();
  });
});
