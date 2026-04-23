/**
 * Real-DB race-condition regression — PrismaCrudService.updateOne must run inside
 * $transaction at ReadCommitted isolation.  Two concurrent PATCH /users/1 requests
 * must not produce a lost-update (the last write either wins or both serialize —
 * the important thing is the row count never shrinks and the final state is valid).
 *
 * Only runs when PRISMA_PROVIDER is set (via test:prisma:postgres / test:prisma:mysql).
 */

import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';

const dialect = (process.env.PRISMA_PROVIDER === 'mysql' ? 'mysql' : 'postgres') as 'postgres' | 'mysql';
const runSuite = process.env.PRISMA_PROVIDER === 'postgresql' || process.env.PRISMA_PROVIDER === 'mysql';

(runSuite ? describe : describe.skip)(`Prisma real-DB race regression [${dialect}]`, () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule.forRoot(dialect)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();

    app = fixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('concurrent PATCH /users/1 — both complete without a 500 or lost-update corruption', async () => {
    // Fire two concurrent updates: one sets nameFirst='ConcurrentA', other sets nameFirst='ConcurrentB'
    const [resA, resB] = await Promise.all([
      request(server).patch('/users/1').send({ nameFirst: 'ConcurrentA' }),
      request(server).patch('/users/1').send({ nameFirst: 'ConcurrentB' }),
    ]);

    // Both must succeed (200) — no 500 from transaction serialization failures
    expect([resA.status, resB.status]).not.toContain(500);
    expect([resA.status, resB.status].every((s) => s === 200)).toBe(true);

    // The final state must be one of the two valid outcomes — not a corrupt merge
    const getRes = await request(server).get('/users/1');
    expect(getRes.status).toBe(200);
    expect(['ConcurrentA', 'ConcurrentB']).toContain(getRes.body.nameFirst);

    // User 1 must still exist and be a single row (no duplication / phantom row)
    const listRes = await request(server).get('/users');
    expect(listRes.status).toBe(200);
    const user1Rows = listRes.body.filter((u: any) => u.id === 1);
    expect(user1Rows.length).toBe(1);
  });
});
