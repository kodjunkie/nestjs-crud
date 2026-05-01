import { buildCacheKey } from '@nestjs-crud/core';
import type { ParsedRequestParams } from '@nestjs-crud/request';

const baseParsed = (): ParsedRequestParams => ({
  fields: [],
  paramsFilter: [],
  authPersist: undefined,
  classTransformOptions: undefined,
  search: { id: { $eq: 1 } },
  filter: [],
  or: [],
  join: [],
  sort: [{ field: 'id', order: 'ASC' }],
  limit: 10,
  offset: 0,
  page: 1,
  cache: undefined as any,
  includeDeleted: 0,
});

describe('buildCacheKey', () => {
  it('produces stable hash regardless of payload key insertion order', () => {
    const a = buildCacheKey('User', { ...baseParsed(), search: { a: 1, b: 2 } as any });
    const b = buildCacheKey('User', { ...baseParsed(), search: { b: 2, a: 1 } as any });
    expect(a).toBe(b);
  });

  it('produces different hash when $and array order differs', () => {
    const a = buildCacheKey('User', { ...baseParsed(), search: { $and: [{ x: 1 }, { y: 2 }] } as any });
    const b = buildCacheKey('User', { ...baseParsed(), search: { $and: [{ y: 2 }, { x: 1 }] } as any });
    expect(a).not.toBe(b);
  });

  it('produces different hash when authPersist differs', () => {
    const a = buildCacheKey('User', { ...baseParsed(), authPersist: { tenantId: 1 } });
    const b = buildCacheKey('User', { ...baseParsed(), authPersist: { tenantId: 2 } });
    expect(a).not.toBe(b);
  });

  it('produces same hash when authPersist is undefined vs explicit null (?? null guard)', () => {
    // `parsed.authPersist ?? null` ensures undefined and absent both serialize to null
    const a = buildCacheKey('User', { ...baseParsed(), authPersist: undefined });
    const b = buildCacheKey('User', { ...baseParsed(), authPersist: null as any });
    expect(a).toBe(b);
  });

  it('returns key prefixed with entityName + ":"', () => {
    expect(buildCacheKey('User', baseParsed())).toMatch(/^User:[a-f0-9]{16}$/);
    expect(buildCacheKey('Order', baseParsed())).toMatch(/^Order:[a-f0-9]{16}$/);
  });

  it('returns 16-char hex hash suffix', () => {
    const key = buildCacheKey('User', baseParsed());
    const [, hash] = key.split(':');
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
    expect(hash.length).toBe(16);
  });
});
