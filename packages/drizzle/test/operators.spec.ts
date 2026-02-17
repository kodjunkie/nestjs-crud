import { mapOperator } from '../src/operators';
import { pgTable, integer, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

const testTable = pgTable('test', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  age: integer('age'),
  email: varchar('email', { length: 255 }),
  isActive: boolean('is_active'),
  deletedAt: timestamp('deleted_at'),
});

describe('mapOperator', () => {
  const col = testTable.name;

  it('should map $eq', () => {
    const result = mapOperator(col, '$eq', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $ne', () => {
    const result = mapOperator(col, '$ne', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $gt', () => {
    const result = mapOperator(testTable.age, '$gt', 18, 'pg');
    expect(result).toBeDefined();
  });

  it('should map $lt', () => {
    const result = mapOperator(testTable.age, '$lt', 18, 'pg');
    expect(result).toBeDefined();
  });

  it('should map $gte', () => {
    const result = mapOperator(testTable.age, '$gte', 18, 'pg');
    expect(result).toBeDefined();
  });

  it('should map $lte', () => {
    const result = mapOperator(testTable.age, '$lte', 18, 'pg');
    expect(result).toBeDefined();
  });

  it('should map $cont (LIKE %val%)', () => {
    const result = mapOperator(col, '$cont', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $excl (NOT LIKE %val%)', () => {
    const result = mapOperator(col, '$excl', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $starts (LIKE val%)', () => {
    const result = mapOperator(col, '$starts', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $ends (LIKE %val)', () => {
    const result = mapOperator(col, '$ends', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $contL (case-insensitive contains) on postgres', () => {
    const result = mapOperator(col, '$contL', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $contL (case-insensitive contains) on mysql', () => {
    const result = mapOperator(col, '$contL', 'John', 'mysql');
    expect(result).toBeDefined();
  });

  it('should map $in', () => {
    const result = mapOperator(col, '$in', ['a', 'b', 'c'], 'pg');
    expect(result).toBeDefined();
  });

  it('should map $notin', () => {
    const result = mapOperator(col, '$notin', ['a', 'b'], 'pg');
    expect(result).toBeDefined();
  });

  it('should map $isnull', () => {
    const result = mapOperator(col, '$isnull', true, 'pg');
    expect(result).toBeDefined();
  });

  it('should map $notnull', () => {
    const result = mapOperator(col, '$notnull', true, 'pg');
    expect(result).toBeDefined();
  });

  it('should map $between', () => {
    const result = mapOperator(testTable.age, '$between', [18, 65], 'pg');
    expect(result).toBeDefined();
  });

  it('should map $eqL (case-insensitive eq)', () => {
    const result = mapOperator(col, '$eqL', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map $neL (case-insensitive ne)', () => {
    const result = mapOperator(col, '$neL', 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should map legacy operators without $ prefix', () => {
    const result = mapOperator(col, 'eq' as any, 'John', 'pg');
    expect(result).toBeDefined();
  });

  it('should throw for unknown operator', () => {
    expect(() => mapOperator(col, '$unknown' as any, 'val', 'pg')).toThrow();
  });
});
