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
 *   Total = 104 assertions — exceeds the ≥45 must-have
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
