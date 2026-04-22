import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { RequestQueryBuilder } from '@nestjs-crud/request';
import request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';
import { seedAll } from './__fixture__/seeds';

// Canonical seed state (from canonical-entities.ts):
//   10 users: ids 1-10
//   Active: 1,2,3,4,5,6,10 (7 total); Inactive: 7,8,9 (3 total)
//   No soft-deleted rows in fresh seed
const TOTAL_USERS = 10;
const ACTIVE_USERS = 7;

// Only run this suite when a real dialect is targeted.
// The existing SQLite unit specs run via `yarn test:mikro-orm` (no MIKRO_ORM_DIALECT).
// `yarn test:mikro-orm:postgres` sets MIKRO_ORM_DIALECT=postgres.
// `yarn test:mikro-orm:mysql` sets MIKRO_ORM_DIALECT=mysql.
const dialect = process.env.MIKRO_ORM_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`MikroOrmCrudService real-DB smoke [${dialect ?? 'skipped'}]`, () => {
  let app: INestApplication;
  let server: any;
  let orm: MikroORM;
  let qb: RequestQueryBuilder;

  beforeAll(async () => {
    // Standalone MikroORM instance for seeding — initialized directly so the schema
    // extension from @mikro-orm/postgresql or @mikro-orm/mysql is properly registered
    // (the Nest-provided MikroORM proxy may not expose orm.schema reliably in test context).
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
    if (app) {
      await app.close();
    }
    if (orm) {
      await orm.close(true);
    }
  });

  beforeEach(async () => {
    qb = RequestQueryBuilder.create();
    // Reseed before each test: drops + recreates schema + inserts canonical data
    await seedAll(orm);
  });

  // Scenario 1: GET /users — returns all 10 seeded users
  it('S1: GET /users returns all seeded users', (done) => {
    request(server)
      .get('/users')
      .end((_, res) => {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(TOTAL_USERS);
        done();
      });
  });

  // Scenario 2: GET /users?limit=3 — returns exactly 3 users
  it('S2: GET /users with limit=3 returns 3 users', (done) => {
    const query = qb.setLimit(3).query();
    request(server)
      .get('/users')
      .query(query)
      .end((_, res) => {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(3);
        done();
      });
  });

  // Scenario 3: GET /users?filter=isActive||$eq||true — returns only active users
  it('S3: GET /users filtered by isActive=true returns active users only', (done) => {
    const query = qb.setFilter({ field: 'isActive', operator: '$eq', value: true }).query();
    request(server)
      .get('/users')
      .query(query)
      .end((_, res) => {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(ACTIVE_USERS);
        expect(res.body.every((u: any) => u.isActive === true)).toBe(true);
        done();
      });
  });

  // Scenario 4: GET /users?sort=email,ASC — verifies sort traverses full pipeline (QueryComposer)
  // This also validates D-05b: if the SQLi guard regresses, the allowlist check throws and the
  // test would fail with 400 instead of 200.
  it('S4: GET /users sorted by email ASC returns users in ascending email order', async () => {
    const query = qb.sortBy({ field: 'email', order: 'ASC' }).query();
    const res = await request(server).get('/users').query(query);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(TOTAL_USERS);

    // All seeded emails must be present (no rows dropped)
    const emails: string[] = res.body.map((u: any) => u.email);
    expect(new Set(emails).size).toBe(TOTAL_USERS);

    // '9@email.com' must sort last in ASC order for both Postgres and MySQL
    // (single-digit-suffix emails sort after multi-digit-suffix under both collations)
    expect(emails[emails.length - 1]).toBe('9@email.com');
  });

  // Scenario 5: GET /users?s={"email":{"$cont":"@email.com"}} — search via $cont operator
  it('S5: GET /users with $cont search on email returns matching users', (done) => {
    const query = qb.search({ email: { $cont: '@email.com' } }).query();
    request(server)
      .get('/users')
      .query(query)
      .end((_, res) => {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(TOTAL_USERS);
        expect(res.body.every((u: any) => String(u.email).includes('@email.com'))).toBe(true);
        done();
      });
  });

  // Scenario 6: GET /users/:id — single user by primary key
  it('S6: GET /users/1 returns user with id=1', (done) => {
    request(server)
      .get('/users/1')
      .end((_, res) => {
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(1);
        expect(res.body.email).toBe('1@email.com');
        done();
      });
  });

  // Scenario 7: POST /users → 201; subsequent GET /users returns 11
  it('S7: POST /users creates a new user; total count becomes 11', async () => {
    const dto = {
      email: 'new@example.com',
      password: 'secret',
      isActive: true,
      // MikroORM accepts FK reference as `{ id: 1 }` for a ManyToOne relation
      company: { id: 1 },
      nameFirst: 'New',
      nameLast: 'User',
    };

    const createRes = await request(server).post('/users').send(dto);
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeTruthy();
    expect(createRes.body.email).toBe('new@example.com');

    const listRes = await request(server).get('/users');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(TOTAL_USERS + 1);
  });

  // Scenario 8: PATCH /users/:id — updates a field and returns updated body
  it('S8: PATCH /users/1 updates nameFirst and returns updated entity', async () => {
    const dto = { nameFirst: 'Updated' };

    const updateRes = await request(server).patch('/users/1').send(dto);
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(1);
    expect(updateRes.body.nameFirst).toBe('Updated');

    // Verify persisted via GET
    const getRes = await request(server).get('/users/1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.nameFirst).toBe('Updated');
  });

  // Scenario 9: DELETE /users/:id (soft-delete) — user disappears from default GET list
  it('S9: DELETE /users/2 soft-deletes; user no longer appears in GET /users', async () => {
    const deleteRes = await request(server).delete('/users/2');
    // returnDeleted: true — service returns the deleted entity body
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.id).toBe(2);

    // Verify soft-deleted user is excluded from default list
    const listRes = await request(server).get('/users');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(TOTAL_USERS - 1);
    expect(listRes.body.every((u: any) => u.id !== 2)).toBe(true);
  });

  // Scenario 10: PATCH /users/:id/recover — soft-deleted user reappears in GET /users
  it('S10: PATCH /users/2/recover recovers soft-deleted user; reappears in GET /users', async () => {
    // First soft-delete user 2
    const deleteRes = await request(server).delete('/users/2');
    expect(deleteRes.status).toBe(200);

    // Recover
    const recoverRes = await request(server).patch('/users/2/recover');
    expect(recoverRes.status).toBe(200);
    expect(recoverRes.body.id).toBe(2);
    expect(recoverRes.body.deletedAt).toBeFalsy();

    // Verify recovered user appears in default GET list again
    const listRes = await request(server).get('/users');
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    expect(listRes.body.length).toBe(TOTAL_USERS);
    expect(listRes.body.some((u: any) => u.id === 2)).toBe(true);
  });
});
