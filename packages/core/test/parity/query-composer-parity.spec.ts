/**
 * QueryComposer piece-level cross-adapter assertion suite.
 *
 * Proves that TypeORM, Drizzle, MikroORM, and Prisma `QueryComposer` implementations
 * produce semantically equivalent row sets for the same `SCondition`/`ParsedRequest`
 * inputs, AND that the dotted-path sort SQLi guard is uniformly enforced across adapters.
 *
 * Assertion counts:
 *   - 15 SCONDITION_CASES × 4 adapters = 60 parity assertions
 *   - 3  SQLI_CASES       × 4 adapters = 12 security assertions
 *   - 5 ORPHAN_JOIN_CASES + 3 VALID_NESTED_JOIN_CASES = 8 × 4 adapters = 32 join-guard assertions
 *   - 2  DEFAULT_SORT_CASES × 4 adapters = 8 route-default-sort order assertions
 *   - 3  SQLI_CASES (as a route default) × 4 adapters = 12 route-default-sort guard assertions
 *   - 4  LOADED_JOIN_CASES × 4 adapters = 16 relation-loading assertions
 *   Total = 140 assertions — exceeds the ≥45 must-have
 *
 * Runs under root jest.config.js (CJS). Docker NOT required — in-memory only.
 * MikroORM + Prisma harnesses use pure mocks — no ORM init, no ESM runtime trap.
 */
import { BadRequestException } from '@nestjs/common';
import type { JoinOptions } from '@nestjs-crud/core';
import type { QueryJoin } from '@nestjs-crud/request';

import { SCONDITION_CASES, SQLI_CASES } from './scondition-matrix';
import { buildTypeOrmComposer, teardownTypeOrmDataSource, type TypeOrmHarness } from './harness/typeorm-harness';
import { buildDrizzleComposer, teardownDrizzleDb, type DrizzleHarness } from './harness/drizzle-harness';
import { buildMikroOrmComposer, type MikroOrmHarness } from './harness/mikro-orm-harness';
import { buildPrismaComposer, type PrismaHarness } from './harness/prisma-harness';

// ---------------------------------------------------------------------------
// Adapter registry — drives describe.each
// ---------------------------------------------------------------------------

type Harness = TypeOrmHarness | DrizzleHarness | MikroOrmHarness | PrismaHarness;

interface AdapterEntry {
  name: string;
  buildSync?: () => Harness;
  buildAsync?: () => Promise<Harness>;
}

const ADAPTERS: AdapterEntry[] = [
  { name: 'typeorm', buildAsync: () => buildTypeOrmComposer() },
  { name: 'drizzle', buildSync: () => buildDrizzleComposer() },
  { name: 'mikro-orm', buildSync: () => buildMikroOrmComposer() },
  { name: 'prisma', buildSync: () => buildPrismaComposer() },
];

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterAll(async () => {
  await teardownTypeOrmDataSource();
  teardownDrizzleDb();
});

// ---------------------------------------------------------------------------
// Helper: build harness (sync or async)
// ---------------------------------------------------------------------------

async function resolveHarness(entry: AdapterEntry): Promise<Harness> {
  if (entry.buildAsync) return entry.buildAsync();
  return entry.buildSync!();
}

// ---------------------------------------------------------------------------
// Parity suite: 15 cases × 3 adapters = 45 assertions
// ---------------------------------------------------------------------------

describe.each(ADAPTERS)('QueryComposer parity — $name', (adapterEntry) => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await resolveHarness(adapterEntry);
  });

  describe.each(SCONDITION_CASES)('case: $name', (kase) => {
    it('produces predicate matching expected IDs', async () => {
      const ids = await harness.applyAndRun(kase.parsed);
      expect(ids.sort((a, b) => a - b)).toEqual(kase.expectedIds.sort((a, b) => a - b));
    });
  });
});

// ---------------------------------------------------------------------------
// SQLi suite: 3 cases × 3 adapters = 9 assertions (dotted-path sort SQLi invariant)
//
// Dotted-path sort fields MUST be routed through onBadRequest (throwing stub).
// A silent pass-through here would allow attacker-controlled identifiers to
// reach the SQL builder unescaped — this is the cross-adapter parity security mandate.
// ---------------------------------------------------------------------------

describe.each(ADAPTERS)('dotted-path sort SQLi guard parity — $name', (adapterEntry) => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await resolveHarness(adapterEntry);
  });

  describe.each(SQLI_CASES)('SQLi case: $name', (sqliCase) => {
    it('rejects fabricated/dotted-path sort field via onBadRequest (must throw)', async () => {
      await expect(harness.applyAndRun(sqliCase.parsed as any)).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Orphan nested join guard parity: 8 cases × 4 adapters = 32 assertions
//
// Every adapter's real join-resolver/composer guard code path (never a
// jest.fn() stand-in) must reject an orphan nested `?join=` entry — one whose
// parent is neither requested nor eager — with the exact same 400 and
// message, and must accept the same three valid nested-join shapes. This is
// the cross-adapter lock for the orphan-nested-join rejection rule.
// ---------------------------------------------------------------------------

interface OrphanJoinCase {
  name: string;
  joins: QueryJoin[];
  joinOptions: JoinOptions;
  field: string;
}

const ORPHAN_JOIN_CASES: OrphanJoinCase[] = [
  {
    name: 'child without parent',
    joins: [{ field: 'profile.licenses' }],
    joinOptions: { profile: {}, 'profile.licenses': {} },
    field: 'profile.licenses',
  },
  {
    name: 'parent requested but not allowlisted',
    joins: [{ field: 'profile' }, { field: 'profile.licenses' }],
    joinOptions: { 'profile.licenses': {} },
    field: 'profile.licenses',
  },
  {
    name: 'missing middle ancestor at depth 3',
    joins: [{ field: 'profile' }, { field: 'profile.licenses.issuer' }],
    joinOptions: { profile: {}, 'profile.licenses': {}, 'profile.licenses.issuer': {} },
    field: 'profile.licenses.issuer',
  },
  {
    name: 'string-prefix sibling is not an ancestor',
    joins: [{ field: 'profiles' }, { field: 'profile.licenses' }],
    joinOptions: { profiles: {}, 'profile.licenses': {} },
    field: 'profile.licenses',
  },
  {
    // @Crud() rejects this exact configuration at startup (CrudRoutesFactory's
    // eager-join validation), so this case exercises the adapters' runtime
    // fallback for direct service calls and for an older core that predates
    // the startup check.
    name: 'eager child with unjoined parent',
    joins: [],
    joinOptions: { profile: {}, 'profile.licenses': { eager: true } },
    field: 'profile.licenses',
  },
];

interface ValidNestedJoinCase {
  name: string;
  joins: QueryJoin[];
  joinOptions: JoinOptions;
}

const VALID_NESTED_JOIN_CASES: ValidNestedJoinCase[] = [
  {
    name: 'parent then child',
    joins: [{ field: 'profile' }, { field: 'profile.licenses' }],
    joinOptions: { profile: {}, 'profile.licenses': {} },
  },
  {
    name: 'child then parent',
    joins: [{ field: 'profile.licenses' }, { field: 'profile' }],
    joinOptions: { profile: {}, 'profile.licenses': {} },
  },
  {
    name: 'eager parent with requested child',
    joins: [{ field: 'profile.licenses' }],
    joinOptions: { profile: { eager: true }, 'profile.licenses': {} },
  },
];
// For MikroORM and Prisma, these valid cases prove acceptance only — those
// adapters do not load nested relations, so only the top-level `profile`
// relation is actually joined/included; `profile.licenses` is accepted but
// silently skipped.

describe.each(ADAPTERS)('orphan nested join guard parity — $name', (adapterEntry) => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await resolveHarness(adapterEntry);
  });

  describe.each(ORPHAN_JOIN_CASES)('orphan case: $name', (kase) => {
    it('rejects with a 400 BadRequestException and the exact shared message', async () => {
      const error: unknown = await harness.applyJoins(kase.joins, kase.joinOptions).then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getStatus()).toBe(400);
      expect((error as BadRequestException).message).toBe(`Invalid join: '${kase.field}'`);
    });
  });

  describe.each(VALID_NESTED_JOIN_CASES)('valid case: $name', (kase) => {
    it('accepts the nested join request', async () => {
      await expect(harness.applyJoins(kase.joins, kase.joinOptions)).resolves.toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Route default sort parity: 2 cases × 4 adapters = 8 assertions
//
// A route-level `@Crud({ query: { sort } })` default must apply when the
// request omits `?sort=`, and a request's `?sort=` must replace the route
// default entirely (never merge) — on all four adapters, not just the three
// that already had the fallback before Prisma's fix.
// ---------------------------------------------------------------------------

interface DefaultSortCase {
  name: string;
  parsed: { sort?: Array<{ field: string; order: 'ASC' | 'DESC' }> };
  routeQuery: { sort: Array<{ field: string; order: 'ASC' | 'DESC' }> };
  /** Expected IDs in exact order — never re-sorted before comparison. */
  expectedIds: number[];
}

const DEFAULT_SORT_CASES: ReadonlyArray<DefaultSortCase> = [
  {
    name: 'route default applies',
    parsed: {},
    routeQuery: { sort: [{ field: 'age', order: 'ASC' }] },
    expectedIds: [7, 3, 1, 10, 4, 2, 9, 5, 6, 8],
  },
  {
    name: 'request sort replaces the route default',
    parsed: { sort: [{ field: 'id', order: 'DESC' }] },
    routeQuery: { sort: [{ field: 'age', order: 'ASC' }] },
    expectedIds: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  },
];

describe.each(ADAPTERS)('route default sort parity — $name', (adapterEntry) => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await resolveHarness(adapterEntry);
  });

  describe.each(DEFAULT_SORT_CASES)('case: $name', (kase) => {
    it('produces IDs in the exact expected order (no re-sorting before comparison)', async () => {
      const ids = await harness.applyAndRun(kase.parsed, kase.routeQuery);
      expect(ids).toEqual(kase.expectedIds);
    });
  });
});

// ---------------------------------------------------------------------------
// Route default sort SQLi guard parity: 3 SQLI_CASES × 4 adapters = 12 assertions
//
// A malicious sort field supplied as a route default (rather than a
// request's ?sort=) must pass through the exact same allowlist and throw
// via onBadRequest — a route default is not a trusted bypass of the guard.
// ---------------------------------------------------------------------------

describe.each(ADAPTERS)('route default sort SQLi guard parity — $name', (adapterEntry) => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await resolveHarness(adapterEntry);
  });

  describe.each(SQLI_CASES)('SQLi case: $name', (sqliCase) => {
    it('rejects fabricated/dotted-path sort field supplied as a route default (must throw)', async () => {
      await expect(harness.applyAndRun({}, { sort: sqliCase.parsed.sort })).rejects.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// Relation loading parity: 4 LOADED_JOIN_CASES × 4 adapters = 16 assertions
//
// A join-option relation loads only when it is eager or requested, and only
// when the join options list it — the same rule on all four adapters. This
// locks the Prisma over-fetch fix and the unlisted-relation allowlist bypass
// fix (both closed against `profile`, the same guard fixture the orphan-join
// block above uses), and proves TypeORM/Drizzle/MikroORM already held the
// rule before Prisma's fix landed.
// ---------------------------------------------------------------------------

interface LoadedJoinCase {
  name: string;
  joins: QueryJoin[];
  joinOptions: JoinOptions;
  expected: string[];
}

const LOADED_JOIN_CASES: LoadedJoinCase[] = [
  {
    name: 'listed, not eager, not requested',
    joins: [],
    joinOptions: { profile: {} },
    expected: [],
  },
  {
    name: 'listed, not eager, requested',
    joins: [{ field: 'profile' }],
    joinOptions: { profile: {} },
    expected: ['profile'],
  },
  {
    name: 'eager, not requested',
    joins: [],
    joinOptions: { profile: { eager: true } },
    expected: ['profile'],
  },
  {
    name: 'requested, not listed',
    joins: [{ field: 'profile' }],
    joinOptions: {},
    expected: [],
  },
];

describe.each(ADAPTERS)('relation loading parity — $name', (adapterEntry) => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await resolveHarness(adapterEntry);
  });

  describe.each(LOADED_JOIN_CASES)('case: $name', (kase) => {
    it('loads exactly the expected relation names', async () => {
      const loaded = await harness.loadedJoins(kase.joins, kase.joinOptions);
      expect(loaded).toEqual(kase.expected);
    });
  });
});
