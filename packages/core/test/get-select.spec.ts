import { getSelect } from '@nestjs-crud/core';

describe('getSelect (pure util)', () => {
  const entityColumns = ['id', 'name', 'email', 'deletedAt'];
  const primary = ['id'];
  const alias = 'user';

  it('returns all allowed columns alias-prefixed when parsed.fields is empty', () => {
    const parsed = { fields: [] } as any;
    const options = {} as any;
    const result = getSelect(parsed, options, entityColumns, primary, alias);
    expect(result).toContain('user.id');
    expect(result).toContain('user.name');
    expect(result).toContain('user.email');
    expect(result).toContain('user.deletedAt');
  });

  it('filters to intersection when parsed.fields is set', () => {
    const parsed = { fields: ['name'] } as any;
    const options = {} as any;
    const result = getSelect(parsed, options, entityColumns, primary, alias);
    expect(result).toContain('user.name');
    expect(result).toContain('user.id');
    expect(result).not.toContain('user.email');
    expect(result).not.toContain('user.deletedAt');
  });

  it('prepends options.persist columns', () => {
    const parsed = { fields: ['name'] } as any;
    const options = { persist: ['createdAt'] } as any;
    const result = getSelect(parsed, options, entityColumns, primary, alias);
    expect(result).toContain('user.createdAt');
    expect(result).toContain('user.name');
  });

  it('always includes entityPrimaryColumns even when not in parsed.fields', () => {
    const parsed = { fields: ['name'] } as any;
    const options = {} as any;
    const result = getSelect(parsed, options, entityColumns, primary, alias);
    expect(result).toContain('user.id');
  });

  it('deduplicates via Set when primary column also appears in parsed.fields', () => {
    const parsed = { fields: ['id'] } as any;
    const options = {} as any;
    const result = getSelect(parsed, options, entityColumns, primary, alias);
    expect(result.filter((c) => c === 'user.id').length).toBe(1);
  });

  it('respects allow/exclude via getAllowedColumns', () => {
    const parsed = { fields: [] } as any;
    const options = { exclude: ['deletedAt'] } as any;
    const result = getSelect(parsed, options, entityColumns, primary, alias);
    expect(result).not.toContain('user.deletedAt');
    expect(result).toContain('user.name');
  });

  it('filters parsed.fields against allowed (disallowed fields dropped)', () => {
    const parsed = { fields: ['name', 'nonExistent'] } as any;
    const options = {} as any;
    const result = getSelect(parsed, options, entityColumns, primary, alias);
    expect(result).toContain('user.name');
    expect(result).not.toContain('user.nonExistent');
  });
});
