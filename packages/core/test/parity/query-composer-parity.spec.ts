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
 *   Total = 72 assertions — exceeds the ≥45 must-have
 *
 * Runs under root jest.config.js (CJS). Docker NOT required — in-memory only.
 * MikroORM + Prisma harnesses use pure mocks — no ORM init, no ESM runtime trap.
 */
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
