/**
 * PARITY-03 — QueryComposer piece-level cross-adapter assertion suite.
 *
 * Proves that TypeORM, Drizzle, and MikroORM `QueryComposer` implementations
 * produce semantically equivalent row sets for the same `SCondition`/`ParsedRequest`
 * inputs, AND that the D-05b SQLi guard is uniformly enforced (T-07-08).
 *
 * Assertion counts:
 *   - 15 SCONDITION_CASES × 3 adapters = 45 parity assertions (T-07-09)
 *   - 3  SQLI_CASES       × 3 adapters = 9  security assertions (T-07-08)
 *   Total = 54 assertions — exceeds the ≥45 must-have
 *
 * Runs under root jest.config.js (CJS). Docker NOT required — in-memory only.
 * MikroORM harness uses a pure mock — no MikroORM.init(), no ESM runtime trap.
 */
import { SCONDITION_CASES, SQLI_CASES } from './scondition-matrix';
import { buildTypeOrmComposer, teardownTypeOrmDataSource, type TypeOrmHarness } from './harness/typeorm-harness';
import { buildDrizzleComposer, teardownDrizzleDb, type DrizzleHarness } from './harness/drizzle-harness';
import { buildMikroOrmComposer, type MikroOrmHarness } from './harness/mikro-orm-harness';

// ---------------------------------------------------------------------------
// Adapter registry — drives describe.each
// ---------------------------------------------------------------------------

type Harness = TypeOrmHarness | DrizzleHarness | MikroOrmHarness;

interface AdapterEntry {
  name: string;
  buildSync?: () => Harness;
  buildAsync?: () => Promise<Harness>;
}

const ADAPTERS: AdapterEntry[] = [
  { name: 'typeorm', buildAsync: () => buildTypeOrmComposer() },
  { name: 'drizzle', buildSync: () => buildDrizzleComposer() },
  { name: 'mikro-orm', buildSync: () => buildMikroOrmComposer() },
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
// Parity suite: 15 cases × 3 adapters = 45 assertions (T-07-09)
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
// SQLi suite: 3 cases × 3 adapters = 9 assertions (T-07-08 / D-05b)
//
// Dotted-path sort fields MUST be routed through onBadRequest (throwing stub).
// A silent pass-through here would allow attacker-controlled identifiers to
// reach the SQL builder unescaped — this is the PARITY-03 security mandate.
// ---------------------------------------------------------------------------

describe.each(ADAPTERS)('D-05b SQLi guard parity — $name', (adapterEntry) => {
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
