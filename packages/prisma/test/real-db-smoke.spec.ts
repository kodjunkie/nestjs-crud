import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RequestQueryBuilder } from '@nestjs-crud/request';
import * as request from 'supertest';

import {
  CANONICAL_SEED_COMPANIES,
  CANONICAL_SEED_USERS,
  CANONICAL_SEED_PROJECTS,
} from '../../core/test/__shared-fixture__/canonical-entities';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';

// Canonical seed state (from canonical-entities.ts):
//   10 users: ids 1-10, all companyId=1
//   Active: 1,2,3,4,5,6,10 (7 total); Inactive: 7,8,9 (3 total)
//   No soft-deleted rows in fresh seed
const TOTAL_USERS = 10;
const ACTIVE_USERS = 7;

// Only run when a real dialect is targeted.
// `yarn test:prisma:postgres` sets PRISMA_PROVIDER=postgresql.
// `yarn test:prisma:mysql` sets PRISMA_PROVIDER=mysql.
const dialect = (process.env.PRISMA_PROVIDER === 'mysql' ? 'mysql' : 'postgres') as 'postgres' | 'mysql';
const runSuite = process.env.PRISMA_PROVIDER === 'postgresql' || process.env.PRISMA_PROVIDER === 'mysql';

// ---------------------------------------------------------------------------
// DB reset helper — truncates + re-inserts canonical data before each test
// ---------------------------------------------------------------------------
async function reseedDb(prisma: any, db: 'postgres' | 'mysql'): Promise<void> {
  if (db === 'mysql') {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE Project');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE User');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE Company');
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
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

(runSuite ? describe : describe.skip)(`PrismaCrudService real-DB smoke [${dialect}]`, () => {
  let app: INestApplication;
  let server: any;
  let qb: RequestQueryBuilder;
  let seedPrisma: any;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule.forRoot(dialect)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();

    app = fixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Standalone Prisma client for seeding — owned by the spec, not NestJS DI
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('../../../node_modules/.prisma/client-smoke');
    seedPrisma = new PrismaClient();
  });

  beforeEach(async () => {
    qb = RequestQueryBuilder.create();
    // Reset DB to canonical seed state before each test to prevent cross-test contamination
    await reseedDb(seedPrisma, dialect);
  });

  afterAll(async () => {
    if (seedPrisma) {
      await seedPrisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  // Scenario 1: GET /users — returns all 10 seeded users (soft-deleted excluded by default)
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

  // Scenario 4: GET /users?sort=email,ASC — verifies sort traverses full pipeline
  it('S4: GET /users sorted by email ASC returns users in ascending email order', async () => {
    const query = qb.sortBy({ field: 'email', order: 'ASC' }).query();
    const res = await request(server).get('/users').query(query);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(TOTAL_USERS);
    // Verify all emails present
    const emails: string[] = res.body.map((u: any) => u.email);
    expect(new Set(emails).size).toBe(TOTAL_USERS);
    // '9@email.com' must be last in ASC order for both dialects
    expect(emails[emails.length - 1]).toBe('9@email.com');
  });

  // Scenario 5: GET /users?s={"email":{"$cont":"@email"}} — search via $cont operator
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
      isActive: true,
      companyId: 1,
      nameFirst: 'New',
      nameLast: 'User',
      password: 'secret',
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
    // returnDeleted: true — returns the deleted entity
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
