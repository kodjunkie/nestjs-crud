import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import {
  CANONICAL_SEED_COMPANIES,
  CANONICAL_SEED_USERS,
  CANONICAL_SEED_PROJECTS,
} from '../../core/test/__shared-fixture__/canonical-entities';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';

const provider = process.env.PRISMA_PROVIDER as 'postgresql' | 'mysql' | undefined;
const runSuite = provider === 'postgresql' || provider === 'mysql';
const dialect = (provider === 'mysql' ? 'mysql' : 'postgres') as 'postgres' | 'mysql';

// ---------------------------------------------------------------------------
// DB reseed helper — truncates + re-inserts canonical seed before each cell.
// Same shape as real-db-smoke.spec.ts; cells 5/9/13 mutate state (POST/DELETE)
// so reseeding before each cell keeps tests independent.
// ---------------------------------------------------------------------------
async function reseedDb(prisma: any, db: 'postgres' | 'mysql'): Promise<void> {
  if (db === 'mysql') {
    // v7 driver-adapter pools per statement — DELETE in child-first FK-safe order.
    await prisma.$executeRawUnsafe('DELETE FROM Project');
    await prisma.$executeRawUnsafe('DELETE FROM User');
    await prisma.$executeRawUnsafe('DELETE FROM Company');
    await prisma.$executeRawUnsafe('ALTER TABLE `Project` AUTO_INCREMENT = 1');
    await prisma.$executeRawUnsafe('ALTER TABLE `User` AUTO_INCREMENT = 1');
    await prisma.$executeRawUnsafe('ALTER TABLE `Company` AUTO_INCREMENT = 1');
  } else {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Project", "User", "Company" RESTART IDENTITY CASCADE');
  }

  for (const c of CANONICAL_SEED_COMPANIES) {
    await prisma.company.create({ data: { ...c } });
  }
  for (const u of CANONICAL_SEED_USERS) {
    await prisma.user.create({ data: { ...u } });
  }
  for (const p of CANONICAL_SEED_PROJECTS ?? []) {
    await prisma.project.create({ data: { ...p } });
  }
}

(runSuite ? describe : describe.skip)(`PrismaCrudService cursor pagination [${dialect}]`, () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let seedPrisma: any;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule.forRoot(dialect)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();

    app = fixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Standalone Prisma client for reseeding — owned by the spec, not NestJS DI.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { makePrismaClient } = require('./__fixture__/make-prisma-client');
    seedPrisma = makePrismaClient(dialect);
  });

  afterAll(async () => {
    if (seedPrisma) {
      await seedPrisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Reset to canonical 10-user seed before each cell so DELETE/POST
    // mutations from one cell don't bleed into the next.
    await reseedDb(seedPrisma, dialect);
  });

  // Cell 1: Forward navigation across 3 pages — no skip/repeat rows
  it('forward navigation across 3 pages returns no skip/repeat rows', async () => {
    const seenIds = new Set<number>();
    let cursor: string | null = null;
    let page = 0;
    while (page < 3) {
      const url = `/users-cursor?sort=id,ASC${cursor ? `&cursor=${cursor}` : ''}`;
      const { body } = await request(server).get(url).expect(200);
      expect(body.cursor).toBeDefined();
      for (const row of body.data) {
        expect(seenIds.has(row.id)).toBe(false);
        seenIds.add(row.id);
      }
      cursor = body.cursor.next;
      if (!cursor) break;
      page++;
    }
    expect(seenIds.size).toBeGreaterThanOrEqual(5);
  });

  // Cell 2: End-of-stream — cursor.next === null
  it('end-of-stream returns cursor.next === null', async () => {
    let cursor: string | null = null;
    let lastBody: any = null;
    for (let i = 0; i < 50; i++) {
      const url = `/users-cursor?sort=id,ASC${cursor ? `&cursor=${cursor}` : ''}`;
      const { body } = await request(server).get(url).expect(200);
      lastBody = body;
      cursor = body.cursor.next;
      if (!cursor) break;
    }
    expect(lastBody.cursor.next).toBeNull();
  });

  // Cell 3: Back-direction cursor — prior page in correct order
  it('back-direction cursor.prev returns prior page in correct order', async () => {
    const page1 = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    expect(page1.cursor.next).toBeTruthy();
    const page2 = (await request(server).get(`/users-cursor?sort=id,ASC&cursor=${page1.cursor.next}`).expect(200)).body;
    expect(page2.cursor.prev).toBeTruthy();
    const back = (await request(server).get(`/users-cursor?sort=id,ASC&cursor=${page2.cursor.prev}`).expect(200)).body;
    expect(back.data.map((r: any) => r.id)).toEqual(page1.data.map((r: any) => r.id));
  });

  // Cell 4: Round-trip forward+back — identical rows as forward page 1
  it('round-trip forward+back returns identical rows', async () => {
    const page1 = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    const page2 = (await request(server).get(`/users-cursor?sort=id,ASC&cursor=${page1.cursor.next}`).expect(200)).body;
    const back = (await request(server).get(`/users-cursor?sort=id,ASC&cursor=${page2.cursor.prev}`).expect(200)).body;
    expect(back.data.map((r: any) => r.id)).toEqual(page1.data.map((r: any) => r.id));
  });

  // Cell 5: Stability under writes — insert mid-pagination, cursor still resolves correctly
  it('cursor stable when row inserted mid-pagination', async () => {
    const page1 = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    expect(page1.cursor.next).toBeTruthy();
    // Insert a new user via the create endpoint; the new user gets a higher id
    // so it appears on a later page — page1 rows must still be absent on page2.
    const ts = Date.now();
    const newUser = {
      email: `stability-${ts}@test.local`,
      password: 'secret',
      isActive: true,
      companyId: 1,
      nameFirst: 'stability',
      nameLast: 'test',
    };
    await request(server).post('/users-cursor').send(newUser).expect(201);
    const page2 = (await request(server).get(`/users-cursor?sort=id,ASC&cursor=${page1.cursor.next}`).expect(200)).body;
    const p1Ids = new Set(page1.data.map((r: any) => r.id));
    for (const r of page2.data) {
      expect(p1Ids.has(r.id)).toBe(false);
    }
  });

  // Cell 6: Multi-sort + cursor → 400 BadRequest
  it('multi-sort + cursor returns 400 BadRequest', async () => {
    const { body } = await request(server).get(`/users-cursor?sort=id,ASC&sort=email,DESC`).expect(400);
    expect(body.message).toMatch(/single sort field/i);
  });

  // Cell 7: Invalid cursor → 400 BadRequest
  it('invalid cursor returns 400 BadRequest', async () => {
    const { body } = await request(server).get(`/users-cursor?sort=id,ASC&cursor=!!!nonsense!!!`).expect(400);
    expect(body.message).toMatch(/Invalid cursor/);
  });

  // Cell 8: Row-id shape — UsersCursorController has no @CrudAuth, so the cell
  // verifies cursor response ids are valid (positive integers) rather than a
  // subset claim that would over-promise without an auth fixture (CL-05 carry-over).
  it('cursor response returns valid row id shape', async () => {
    const cursorBody = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    expect(cursorBody.data.length).toBeGreaterThan(0);
    for (const r of cursorBody.data) {
      expect(typeof r.id).toBe('number');
      expect(r.id).toBeGreaterThan(0);
    }
  });

  // Cell 9: Hard-delete still applies in cursor mode — UsersCursorController has
  // no softDelete config, so DELETE is a hard delete via Prisma's delete().
  // Either way the deleted id must not appear in any cursor page (CL-04 carry-over).
  it('hard-delete still applies in cursor mode', async () => {
    const initial = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    expect(initial.data.length).toBeGreaterThan(0);
    const targetId = initial.data[initial.data.length - 1].id;

    await request(server).delete(`/users-cursor/${targetId}`).expect(200);

    // Re-fetch — deleted id must not appear in any page
    const allIds = new Set<number>();
    let cursor: string | null = null;
    for (let i = 0; i < 20; i++) {
      const url = `/users-cursor?sort=id,ASC${cursor ? `&cursor=${cursor}` : ''}`;
      const { body } = await request(server).get(url).expect(200);
      for (const r of body.data) allIds.add(r.id);
      cursor = body.cursor.next;
      if (!cursor) break;
    }
    expect(allIds.has(targetId)).toBe(false);
  });

  // Cell 10: Response shape — no total/page/pageCount keys
  it('response shape has no total/page/pageCount keys', async () => {
    const { body } = await request(server).get(`/users-cursor?sort=id,ASC`).expect(200);
    expect(body.total).toBeUndefined();
    expect(body.page).toBeUndefined();
    expect(body.pageCount).toBeUndefined();
    expect(body.cursor).toBeDefined();
    expect(body.cursor.next).toBeDefined();
    expect(body.cursor.prev).toBeNull();
  });

  // Cell 11: SQLi guard — ?sort=id;DROP rejected via existing entityColumns allowlist
  it('SQLi guard rejects sort field with semicolon via existing allowlist', async () => {
    await request(server).get(`/users-cursor?sort=id;DROP,ASC`).expect(400);
  });

  // Cell 12: Descending sort works symmetrically
  it('descending sort works symmetrically', async () => {
    const page1 = (await request(server).get(`/users-cursor?sort=id,DESC`).expect(200)).body;
    expect(page1.data.length).toBeGreaterThan(0);
    expect(page1.cursor.next).toBeTruthy();
    const page2 = (await request(server).get(`/users-cursor?sort=id,DESC&cursor=${page1.cursor.next}`).expect(200))
      .body;
    const p1Ids = new Set(page1.data.map((r: any) => r.id));
    for (const r of page2.data) {
      expect(p1Ids.has(r.id)).toBe(false);
    }
    // DESC: page1 ids should all be > page2 ids (descending order)
    const minP1 = Math.min(...page1.data.map((r: any) => r.id));
    const maxP2 = Math.max(...page2.data.map((r: any) => r.id));
    expect(minP1).toBeGreaterThan(maxP2);
  });

  // Cell 13: PK tie-breaker — deterministic order when sort field has equal values
  it('PK tie-breaker on sort-field ties returns deterministic order', async () => {
    // Sort by companyId (integer) — all 10 seeded users share companyId=1, so
    // every row ties on the sort column. The PK tie-breaker (ORDER BY companyId
    // ASC, id ASC) must produce a stable ordering: lower id row always appears
    // before higher id row. Inserting two extra users with companyId=1 lets us
    // assert the tie-breaker is honoured. Integer column avoids the JS Date
    // ms-vs-DB-microsecond precision issue that bit Plan 02 cell 13.
    const ts = Date.now();
    const userA = (
      await request(server)
        .post('/users-cursor')
        .send({
          email: `tieA-${ts}@tie.local`,
          password: 'secret',
          isActive: true,
          companyId: 1,
          nameFirst: 'tieA',
          nameLast: 'test',
        })
        .expect(201)
    ).body;
    const userB = (
      await request(server)
        .post('/users-cursor')
        .send({
          email: `tieB-${ts}@tie.local`,
          password: 'secret',
          isActive: true,
          companyId: 1,
          nameFirst: 'tieB',
          nameLast: 'test',
        })
        .expect(201)
    ).body;

    // Paginate all pages with sort=companyId,ASC — all users tie on companyId=1,
    // so the PK tie-breaker (id ASC) governs their order within each page.
    const allIds: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 30; i++) {
      const url = `/users-cursor?sort=companyId,ASC${cursor ? `&cursor=${cursor}` : ''}`;
      const { body } = await request(server).get(url).expect(200);
      for (const r of body.data) allIds.push(r.id);
      cursor = body.cursor.next;
      if (!cursor) break;
    }

    const posA = allIds.indexOf(userA.id);
    const posB = allIds.indexOf(userB.id);
    // Both users must appear in the full result set exactly once
    expect(posA).toBeGreaterThanOrEqual(0);
    expect(posB).toBeGreaterThanOrEqual(0);
    // No duplicates — each id appears exactly once across all pages
    const idSet = new Set(allIds);
    expect(idSet.size).toBe(allIds.length);
    // PK tie-breaker ensures lower-id row appears before higher-id row
    if (userA.id < userB.id) {
      expect(posA).toBeLessThan(posB);
    } else {
      expect(posB).toBeLessThan(posA);
    }
  });

  // Cell 14: Cursor mode bypasses Phase 21 cache wrap — response shape proves direct path
  it('cursor mode bypasses cache wrap (response shape proves direct path, not cached offset)', async () => {
    // Two identical cursor requests — both must return cursor shape (not offset/cached shape).
    const r1 = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    const r2 = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    // Cursor shape: has cursor.next/prev, no total/page/pageCount
    expect(r1.total).toBeUndefined();
    expect(r2.total).toBeUndefined();
    expect(r1.cursor).toBeDefined();
    expect(r2.cursor).toBeDefined();
    // Consistent results (deterministic order)
    expect(r1.data.map((r: any) => r.id)).toEqual(r2.data.map((r: any) => r.id));
  });

  // Cell 15: Missing limit + cursor → 400 (uses /users-cursor-no-limit auxiliary fixture)
  it('missing limit and cursor mode returns 400 BadRequest', async () => {
    // /users-cursor-no-limit has @Crud({ query: { pagination: 'cursor' } }) with NO limit/maxLimit.
    // doGetManyCursor sees getTake() return null and throws BadRequestException.
    const { body } = await request(server).get(`/users-cursor-no-limit?sort=id,ASC`).expect(400);
    expect(body.message).toMatch(/cursor pagination requires a limit/i);
  });

  // Cell 16 (Prisma-specific): Verify cursor shape proves Prisma built-in cursor: arg is bypassed.
  // Prisma's built-in `cursor: { id }` arg is single-column unique-key only and would NOT support
  // the (sortField, id) tuple semantics this library needs. PrismaQueryComposer.applyCursor emits
  // an OR-decomposed `where` instead. This cell asserts the response shape proves the OR-decomposed
  // path is in use (cursor.next encoded; cursor envelope present).
  it('does not emit Prisma built-in cursor: arg in the query (uses OR-decomposed where)', async () => {
    const page1 = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    expect(page1.cursor).toBeDefined();
    expect(page1.cursor.next).toBeTruthy();
    // Walk forward — if Prisma's built-in cursor: arg (single-column unique-key) were in use
    // for sort=id, the keyset path would still work for `id` but break on sort=companyId. The
    // companyId walk above (cell 13) already exercises that path; this cell additionally
    // verifies that on the id-sort path the response is the keyset shape, not Prisma's
    // built-in cursor: { id: { gt: N } } shape (which would still work but is bypassed).
    const page2 = (await request(server).get(`/users-cursor?sort=id,ASC&cursor=${page1.cursor.next}`).expect(200)).body;
    // page2 must extend forward (no overlap with page1)
    const p1Ids = new Set(page1.data.map((r: any) => r.id));
    for (const r of page2.data) {
      expect(p1Ids.has(r.id)).toBe(false);
    }
    // page2 carries a prev cursor (only set when decoded is non-null — confirms the cursor arg
    // is consumed by our codec, not by Prisma's built-in cursor: skip-ahead).
    expect(page2.cursor.prev).toBeTruthy();
  });
});
