import { PrismaWhereBuilder } from '../src/query/prisma-where-builder';

describe('PrismaWhereBuilder', () => {
  const builder = new PrismaWhereBuilder({
    entityColumns: ['id', 'name', 'age', 'deletedAt'],
    relationFields: ['company', 'projects'],
    onBadRequest: (msg: string) => {
      throw new Error(msg);
    },
  });

  // Basic scalar / primitive shorthand
  it('plain scalar → short form { field: value }', () => {
    expect(builder.build({ id: 5 } as any)).toEqual({ id: 5 });
  });

  it('$eq → equals short form { field: value }', () => {
    expect(builder.build({ id: { $eq: 5 } } as any)).toEqual({ id: 5 });
  });

  it('$ne → { field: { not: value } }', () => {
    expect(builder.build({ id: { $ne: 5 } } as any)).toEqual({ id: { not: 5 } });
  });

  it('$gt → { field: { gt: value } }', () => {
    expect(builder.build({ age: { $gt: 10 } } as any)).toEqual({ age: { gt: 10 } });
  });

  it('$gte → { field: { gte: value } }', () => {
    expect(builder.build({ age: { $gte: 10 } } as any)).toEqual({ age: { gte: 10 } });
  });

  it('$lt → { field: { lt: value } }', () => {
    expect(builder.build({ age: { $lt: 10 } } as any)).toEqual({ age: { lt: 10 } });
  });

  it('$lte → { field: { lte: value } }', () => {
    expect(builder.build({ age: { $lte: 10 } } as any)).toEqual({ age: { lte: 10 } });
  });

  it('$cont → { field: { contains: value } }', () => {
    expect(builder.build({ name: { $cont: 'foo' } } as any)).toEqual({ name: { contains: 'foo' } });
  });

  it('$contL → { field: { contains: value, mode: insensitive } }', () => {
    expect(builder.build({ name: { $contL: 'foo' } } as any)).toEqual({
      name: { contains: 'foo', mode: 'insensitive' },
    });
  });

  it('$excl → { field: { NOT: { contains: value } } }', () => {
    expect(builder.build({ name: { $excl: 'foo' } } as any)).toEqual({ name: { NOT: { contains: 'foo' } } });
  });

  it('$exclL → { field: { NOT: { contains: value, mode: insensitive } } }', () => {
    expect(builder.build({ name: { $exclL: 'foo' } } as any)).toEqual({
      name: { NOT: { contains: 'foo', mode: 'insensitive' } },
    });
  });

  it('$starts → { field: { startsWith: value } }', () => {
    expect(builder.build({ name: { $starts: 'fo' } } as any)).toEqual({ name: { startsWith: 'fo' } });
  });

  it('$ends → { field: { endsWith: value } }', () => {
    expect(builder.build({ name: { $ends: 'oo' } } as any)).toEqual({ name: { endsWith: 'oo' } });
  });

  it('$eqL → { field: { equals: value, mode: insensitive } }', () => {
    expect(builder.build({ name: { $eqL: 'Foo' } } as any)).toEqual({ name: { equals: 'Foo', mode: 'insensitive' } });
  });

  it('$neL → { field: { NOT: { equals: value, mode: insensitive } } }', () => {
    expect(builder.build({ name: { $neL: 'Foo' } } as any)).toEqual({
      name: { NOT: { equals: 'Foo', mode: 'insensitive' } },
    });
  });

  it('$in → { field: { in: array } }', () => {
    expect(builder.build({ id: { $in: [1, 2, 3] } } as any)).toEqual({ id: { in: [1, 2, 3] } });
  });

  it('$notin → { field: { notIn: array } }', () => {
    expect(builder.build({ id: { $notin: [1, 2] } } as any)).toEqual({ id: { notIn: [1, 2] } });
  });

  // $inL / $notinL — native Prisma, NO OR/AND expansion, NO mode modifier
  it('$inL → { field: { in: array } } (native Prisma, no mode, no OR expansion)', () => {
    const result = builder.build({ name: { $inL: ['A', 'B'] } } as any);
    expect(result).toEqual({ name: { in: ['A', 'B'] } });
    expect(JSON.stringify(result)).not.toContain('OR');
    expect(JSON.stringify(result)).not.toContain('mode');
  });

  it('$notinL → { field: { notIn: array } } (native Prisma, no mode, no AND expansion)', () => {
    const result = builder.build({ name: { $notinL: ['A', 'B'] } } as any);
    expect(result).toEqual({ name: { notIn: ['A', 'B'] } });
    expect(JSON.stringify(result)).not.toContain('AND');
    expect(JSON.stringify(result)).not.toContain('mode');
  });

  it('$isnull → { field: null }', () => {
    expect(builder.build({ deletedAt: { $isnull: true } } as any)).toEqual({ deletedAt: null });
  });

  it('$notnull → { field: { not: null } }', () => {
    expect(builder.build({ deletedAt: { $notnull: true } } as any)).toEqual({ deletedAt: { not: null } });
  });

  it('$between → { field: { gte: v0, lte: v1 } }', () => {
    expect(builder.build({ age: { $between: [18, 65] } } as any)).toEqual({ age: { gte: 18, lte: 65 } });
  });

  // Logical combinators
  it('$and → { AND: [...] }', () => {
    expect(builder.build({ $and: [{ id: 1 }, { name: 'x' }] } as any)).toEqual({
      AND: [{ id: 1 }, { name: 'x' }],
    });
  });

  it('$or (only key) → { OR: [...] }', () => {
    expect(builder.build({ $or: [{ id: 1 }, { id: 2 }] } as any)).toEqual({ OR: [{ id: 1 }, { id: 2 }] });
  });

  it('mixed scalar + $or → spread scalars + OR key', () => {
    expect(builder.build({ id: 1, $or: [{ name: 'a' }, { name: 'b' }] } as any)).toEqual({
      id: 1,
      OR: [{ name: 'a' }, { name: 'b' }],
    });
  });

  // Dotted-path (spike pattern 1)
  it('dotted-path → nested relation object', () => {
    expect(builder.build({ 'company.name': { $cont: 'corp' } } as any)).toEqual({
      company: { name: { contains: 'corp' } },
    });
  });

  // Unknown relation guard
  it('unknown relation → calls onBadRequest', () => {
    expect(() => builder.build({ 'unknown.foo': 1 } as any)).toThrow(/Unknown relation: unknown/);
  });

  // Empty/null/undefined
  it('empty search → {}', () => {
    expect(builder.build({} as any)).toEqual({});
  });

  it('null search → {}', () => {
    expect(builder.build(null as any)).toEqual({});
  });
});
