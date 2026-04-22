// T-09-01 regression: D-05b SQLi invariant for PrismaQueryComposer sort branch.
// Mirrors packages/drizzle/test/sort-sqli.regression.spec.ts. onBadRequest MUST throw
// (never jest.fn() — per CLAUDE.md D-05b guard pattern).
import { BadRequestException } from '@nestjs/common';

import { PrismaJoinResolver } from '../src/prisma-join-resolver';
import { PrismaQueryComposer } from '../src/query/prisma-query-composer';
import { PrismaWhereBuilder } from '../src/query/prisma-where-builder';

// CONTRACT: throwing stub — never `jest.fn()` on a security path.
const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

const entityColumns = ['id', 'email', 'name', 'deletedAt', 'companyId'];
const relationFields = ['company', 'projects'];
const allowedColumnsByRelation: Record<string, string[]> = {
  company: ['id', 'name', 'domain', 'deletedAt'],
  projects: ['id', 'name', 'companyId'],
};

describe('T-09-01 PrismaQueryComposer sort SQLi regression (D-05b invariant)', () => {
  let composer: PrismaQueryComposer;

  const emptyParsed = {
    fields: [],
    paramsFilter: [],
    authPersist: undefined,
    classTransformOptions: undefined,
    search: {},
    filter: [],
    or: [],
    join: [],
    sort: [],
    limit: undefined,
    offset: undefined,
    page: undefined,
    cache: undefined,
    includeDeleted: 0,
  } as any;

  const emptyOptions = { query: {}, routes: {}, params: {} } as any;

  beforeEach(() => {
    const joinResolver = new PrismaJoinResolver({ relationFields, allowedColumnsByRelation });
    const whereBuilder = new PrismaWhereBuilder({
      entityColumns,
      relationFields,
      onBadRequest: throwingOnBadRequest,
    });
    composer = new PrismaQueryComposer({
      entityColumns,
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: true,
      softDeleteColumn: 'deletedAt',
      onBadRequest: throwingOnBadRequest,
      joinResolver,
      whereBuilder,
      relationFields,
    });
  });

  // Case 1: bare column sort (happy path — ASC lowercased per spike pattern 2)
  it('emits lowercase asc for bare known column', () => {
    const parsed = { ...emptyParsed, sort: [{ field: 'name', order: 'ASC' }] };
    const result = composer.applyToQuery({}, parsed, emptyOptions);
    expect(result.orderBy).toEqual([{ name: 'asc' }]);
  });

  // Case 2: known dotted-path compiles to nested orderBy
  it('emits nested orderBy for known dotted-path sort', () => {
    const parsed = { ...emptyParsed, sort: [{ field: 'company.name', order: 'ASC' }] };
    const result = composer.applyToQuery({}, parsed, emptyOptions);
    expect(result.orderBy).toEqual([{ company: { name: 'asc' } }]);
  });

  // Case 3: unknown relation throws via onBadRequest
  it('throws BadRequestException for unknown relation in dotted-path sort', () => {
    const parsed = { ...emptyParsed, sort: [{ field: 'notARelation.foo', order: 'ASC' }] };
    expect(() => composer.applyToQuery({}, parsed, emptyOptions)).toThrow(BadRequestException);
  });

  // Case 4: unknown column on known relation throws via onBadRequest
  it('throws BadRequestException for unknown column on known relation', () => {
    const parsed = { ...emptyParsed, sort: [{ field: 'company.EVIL', order: 'ASC' }] };
    expect(() => composer.applyToQuery({}, parsed, emptyOptions)).toThrow(BadRequestException);
  });

  // Case 5: literal SQL-injection payload in field name
  it('rejects SQL-injection payload in sort field', () => {
    const parsed = { ...emptyParsed, sort: [{ field: 'id); DROP TABLE users; --', order: 'ASC' }] };
    expect(() => composer.applyToQuery({}, parsed, emptyOptions)).toThrow(/Unknown column/);
  });

  // Case 6: empty allowlist for known relation still throws (defense-in-depth)
  it('throws when allowedColumnsByRelation is empty for the relation', () => {
    const joinResolverEmpty = new PrismaJoinResolver({
      relationFields,
      allowedColumnsByRelation: { company: [], projects: [] },
    });
    const whereBuilder = new PrismaWhereBuilder({
      entityColumns,
      relationFields,
      onBadRequest: throwingOnBadRequest,
    });
    const composerEmpty = new PrismaQueryComposer({
      entityColumns,
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: false,
      softDeleteColumn: null,
      onBadRequest: throwingOnBadRequest,
      joinResolver: joinResolverEmpty,
      whereBuilder,
      relationFields,
    });
    const parsed = { ...emptyParsed, sort: [{ field: 'company.name', order: 'ASC' }] };
    expect(() => composerEmpty.applyToQuery({}, parsed, emptyOptions)).toThrow(BadRequestException);
  });
});
