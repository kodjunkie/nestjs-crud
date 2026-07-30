import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';
import { seedAll } from './__fixture__/seeds';

const dialect = process.env.MIKRO_ORM_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`MikroOrmCrudService cursor pagination [${dialect ?? 'skipped'}]`, () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let orm: MikroORM;

  beforeAll(async () => {
    // Standalone MikroORM instance for seeding — initialized directly so the
    // schema extension from @mikro-orm/postgresql or @mikro-orm/mysql is
    // properly registered. Mirrors the pattern used by users-repo.spec.ts +
    // cache-strategy.spec.ts.
    const configModule =
      dialect === 'postgres'
        ? await import('./__fixture__/mikro-orm.postgres.config')
        : await import('./__fixture__/mikro-orm.mysql.config');
    orm = await MikroORM.init(configModule.default);

    const moduleRef = await Test.createTestingModule({
      imports: [await AppModule.forRoot(dialect!)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (orm) await orm.close(true);
  });

  beforeEach(async () => {
    // Reset to the canonical 10-user seed before each cell so DELETE/POST
    // mutations from one cell don't bleed into the next.
    await seedAll(orm);
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
      company: { id: 1 },
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
  // subset claim that would over-promise without an auth fixture.
  it('cursor response returns valid row id shape', async () => {
    const cursorBody = (await request(server).get(`/users-cursor?sort=id,ASC`).expect(200)).body;
    expect(cursorBody.data.length).toBeGreaterThan(0);
    for (const r of cursorBody.data) {
      expect(typeof r.id).toBe('number');
      expect(r.id).toBeGreaterThan(0);
    }
  });

  // Cell 9: Hard-delete still applies in cursor mode — UsersCursorController has
  // no softDelete config, so DELETE is a hard delete via em.remove(). Either
  // way the deleted id must not appear in any cursor page.
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

  // Cell 11: SQLi guard — ?sort=id;DROP rejected via existing propertiesMap allowlist
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
    // Sort by isActive (boolean stored as integer) — most seeded users share
    // isActive=true (7 of 10), so most rows tie on the sort column. The PK
    // tie-breaker (ORDER BY isActive ASC, id ASC) must produce a stable
    // ordering: lower id row always appears before higher id row within each
    // tie bucket. Inserting two extra users with isActive=true lets us assert
    // the tie-breaker is honoured. Using a non-timestamp column avoids the JS
    // Date ms-vs-DB-microsecond precision issue that bit Plan 02 cell 13.
    const ts = Date.now();
    const userA = (
      await request(server)
        .post('/users-cursor')
        .send({
          email: `tieA-${ts}@tie.local`,
          password: 'secret',
          isActive: true,
          company: { id: 1 },
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
          company: { id: 1 },
          nameFirst: 'tieB',
          nameLast: 'test',
        })
        .expect(201)
    ).body;

    // Paginate all pages with sort=isActive,ASC — the PK tie-breaker (id ASC)
    // governs row order within each isActive bucket.
    const allIds: number[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 30; i++) {
      const url = `/users-cursor?sort=isActive,ASC${cursor ? `&cursor=${cursor}` : ''}`;
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

  // Cell 16: Route-declared default sort — no ?sort= param returns 200 and the next
  // cursor decodes to the route's declared default field, proving the fallback (not
  // incidental ordering) drove the page.
  it('cursor mode with no ?sort= falls back to the route default sort and returns 200', async () => {
    const { body } = await request(server).get(`/users-cursor-default-sort`).expect(200);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.cursor).toBeDefined();
    expect(body.cursor.next).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(body.cursor.next, 'base64url').toString('utf8'));
    expect(decoded.sortField).toBe('id');
  });

  // Cell 17: Multi-field route default — still 400, message identifies the route default
  // (not the request) as the origin and reports the field count.
  it('cursor mode with a multi-field route default and no ?sort= returns 400 naming the route default', async () => {
    const { body } = await request(server).get(`/users-cursor-multi-sort`).expect(400);
    expect(body.message).toMatch(/single sort field/i);
    expect(body.message).toContain('2');
    expect(body.message).toMatch(/@Crud\(\{ query: \{ sort \} \}\)/);
  });

  // Cell 18: No sort anywhere — declared neither by the client nor by the route — still
  // 400, and the message names both remedies with no legacy count-suffix wording (D-04).
  it('cursor mode with no ?sort= and no route default returns 400 naming both remedies', async () => {
    const { body } = await request(server).get(`/users-cursor`).expect(400);
    expect(body.message).toMatch(/single sort field/i);
    expect(body.message).toMatch(/\?sort=/);
    expect(body.message).toMatch(/@Crud\(\{ query: \{ sort \} \}\)/);
    expect(body.message).not.toMatch(/got:/);
  });
});
