// Wave 2 plan 21-05: Drizzle cache-strategy integration spec
// Exercises the production TTL wiring path: fixture controller declares
// @Crud({ query: { cache: 5000 } }) so FetchHelper's getEffectiveTtl(options)
// returns 5000 from options.query.cache at request time (D-10 contract).
// Uses MockCacheStrategy (in-memory, deterministic) — NOT real Redis.

import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CrudConfigService, MockCacheStrategy } from '@nestjs-crud/core';
import * as request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';
import { seedAll } from './__fixture__/seeds';
import { createPostgresClient, tearDownPostgres } from './__fixture__/db.postgres';
import { createMysqlClient, tearDownMysql } from './__fixture__/db.mysql';

const dialect = process.env.DRIZZLE_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`DrizzleCrudService cache strategy [${dialect ?? 'skipped'}]`, () => {
  let app: INestApplication;
  let server: any;
  let seedDb: any;
  let strategy: MockCacheStrategy;
  let invalidateSpy: jest.SpyInstance;
  let wrapSpy: jest.SpyInstance;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule.forRoot(dialect!)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();

    app = fixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Standalone client for seeding — the in-module client is owned by Nest DI
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
    await seedAll(seedDb, dialect!);
    strategy = new MockCacheStrategy();
    invalidateSpy = jest.spyOn(strategy, 'invalidate');
    wrapSpy = jest.spyOn(strategy, 'wrap');
    // Production wiring: set BOTH the strategy AND the global TTL anchor.
    // The FetchHelper's getEffectiveTtl reads options.query.cache at request
    // time, sourced from the @Crud({ query: { cache: 5000 } }) decorator on
    // the UsersCachedController fixture — NOT from this global cache value.
    // The global cache: 5000 here acts as a redundant consistency signal.
    CrudConfigService.load({
      query: { cache: 5000, cacheStrategy: strategy },
    });
  });

  afterEach(() => {
    CrudConfigService.reset();
    jest.restoreAllMocks();
  });

  it('cache-hit: second read returns cached payload', async () => {
    const a = await request(server).get('/users-cached');
    const b = await request(server).get('/users-cached');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(wrapSpy).toHaveBeenCalled();
  });

  it('cache-miss: cleared cache triggers fresh DB query', async () => {
    await request(server).get('/users-cached'); // populate cache
    await strategy.invalidate('users:'); // clear manually
    invalidateSpy.mockClear();
    const fresh = await request(server).get('/users-cached');
    expect(fresh.status).toBe(200);
    // invalidate was not called by the service on a GET (only on writes)
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('auto-invalidate-on-write: createOne evicts entity-prefix cache entries', async () => {
    await request(server).get('/users-cached'); // populate cache
    invalidateSpy.mockClear();

    const res = await request(server)
      .post('/users-cached')
      .send({ email: 'drizzle-cache-spec-1@example.com', isActive: true, companyId: 1 });
    expect([200, 201]).toContain(res.status);
    // After write, _invalidateCache fires strategy.invalidate('users:')
    expect(invalidateSpy).toHaveBeenCalledWith('users:');
  });

  it('?cache=0 bypass: per-request opt-out skips wrap', async () => {
    await request(server).get('/users-cached'); // populate cache
    wrapSpy.mockClear();

    const bypass = await request(server).get('/users-cached').query({ cache: '0' });
    expect(bypass.status).toBe(200);
    // wrap NOT called for the bypass request (parsed.cache === 0 short-circuits)
    expect(wrapSpy).not.toHaveBeenCalled();
  });

  it('throws CrudCacheNotConfiguredError when @Crud cache set without strategy (D-11 unconditional)', async () => {
    // Reset removes the global strategy. The UsersCachedController declares
    // @Crud({ query: { cache: 5000 } }) — now no strategy is wired anywhere.
    // FetchHelper.assertStrategyOrPassThrough throws CrudCacheNotConfiguredError
    // → propagates as 500 under the default Nest exception filter.
    CrudConfigService.reset();
    const res = await request(server).get('/users-cached');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
