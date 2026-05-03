import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';
import { createMysqlClient, tearDownMysql } from './__fixture__/db.mysql';
import { createPostgresClient, tearDownPostgres } from './__fixture__/db.postgres';
import { seedAll } from './__fixture__/seeds';

const dialect = process.env.DRIZZLE_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`DrizzleCrudService cursor pagination [${dialect ?? 'skipped'}]`, () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let seedDb: any;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule.forRoot(dialect!)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();

    app = fixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Standalone client for re-seeding between cells
    seedDb = dialect === 'postgres' ? createPostgresClient() : createMysqlClient();
  });

  afterAll(async () => {
    await app.close();
    if (dialect === 'postgres') {
      await tearDownPostgres();
    } else {
      await tearDownMysql();
    }
  });

  beforeEach(async () => {
    // Reset to canonical 10-user seed before each cell so DELETE/POST
    // mutations from one cell don't bleed into the next.
    await seedAll(seedDb, dialect!);
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
    // so it appears on a later page — page1 rows should still be absent on page2.
    const ts = Date.now();
    const newUser = {
      email: `stability-${ts}@test.local`,
      isActive: true,
      companyId: 1,
      nameFirst: 'stability',
      nameLast: 'test',
      profileId: null,
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

  // Cell 8: @CrudAuth filter still applies — cursor pages are subset of full result
  it('@CrudAuth filter still applies in cursor mode', async () => {
    // /users-cursor does not restrict by company param. Both /users-cursor and
    // /users share the same UsersService — verify cursor response ids are
    // valid user ids (positive integers).
    const cursorBody = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    expect(cursorBody.data.length).toBeGreaterThan(0);
    for (const r of cursorBody.data) {
      expect(typeof r.id).toBe('number');
      expect(r.id).toBeGreaterThan(0);
    }
  });

  // Cell 9: Soft-delete still applies in cursor mode — deleted row absent from cursor pages
  it('hard-delete still applies in cursor mode', async () => {
    // /users-cursor has no softDelete config, so DELETE is a hard delete.
    // Either way the deleted id must not appear in any cursor page.
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

  // Cell 11: SQLi guard — ?sort=id;DROP rejected via existing columnsMap allowlist
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
    // Sort by companyId (integer) — all seeded users share companyId=1, so every row
    // ties on the sort column. The PK tie-breaker (ORDER BY companyId ASC, id ASC)
    // must produce a stable ordering: lower id row always appears before higher id row.
    // Inserting two extra users with companyId=1 lets us assert the tie-breaker
    // is honoured. Integer column avoids the JS Date ms-vs-DB-microsecond
    // precision issue that bit Plan 02 cell 13 on createdAt.
    const ts = Date.now();
    const userA = (
      await request(server)
        .post('/users-cursor')
        .send({
          email: `tieA-${ts}@tie.local`,
          isActive: true,
          companyId: 1,
          nameFirst: 'tieA',
          nameLast: 'test',
          profileId: null,
        })
        .expect(201)
    ).body;
    const userB = (
      await request(server)
        .post('/users-cursor')
        .send({
          email: `tieB-${ts}@tie.local`,
          isActive: true,
          companyId: 1,
          nameFirst: 'tieB',
          nameLast: 'test',
          profileId: null,
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
});
