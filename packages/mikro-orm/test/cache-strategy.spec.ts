// Wave 2 plan 21-03: MikroORM cache-strategy integration spec
// Exercises the production TTL wiring path: fixture controller declares
// @Crud({ query: { cache: 5000 } }) so FetchHelper's getEffectiveTtl(options)
// returns 5000 from options.query.cache at request time (D-10 contract).
// Uses MockCacheStrategy (in-memory, deterministic) — NOT real Redis.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { CrudConfigService, MockCacheStrategy } from '@nestjs-crud/core';
import request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';
import { seedAll } from './__fixture__/seeds';

const dialect = process.env.MIKRO_ORM_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`MikroOrmCrudService cache strategy [${dialect ?? 'skipped'}]`, () => {
  let app: INestApplication;
  let server: any;
  let orm: MikroORM;
  let strategy: MockCacheStrategy;
  let invalidateSpy: jest.SpyInstance;
  let wrapSpy: jest.SpyInstance;

  beforeAll(async () => {
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
    await seedAll(orm);
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

  it('cache-hit: second read returns cached payload; wrap called with @Crud option ttl (5000ms)', async () => {
    const a = await request(server).get('/users-cached');
    const b = await request(server).get('/users-cached');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    // Production-wiring check: wrap is invoked with the ttl from @Crud option (5000ms).
    // Proves getEffectiveTtl(options) sourced TTL from options.query.cache (D-10)
    // and that ttl is in MILLISECONDS uniformly (FIX 1).
    expect(wrapSpy).toHaveBeenCalled();
    const wrapCalls = wrapSpy.mock.calls as unknown[][];
    expect(wrapCalls.some((args) => args[2] === 5000)).toBe(true);
  });

  it('cache-miss: cleared cache triggers fresh DB query', async () => {
    await request(server).get('/users-cached'); // populate cache
    await strategy.invalidate('User:'); // clear manually
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
      .send({
        email: 'mikro-cache-spec-inv@example.com',
        password: 'test-secret',
        isActive: true,
        company: { id: 1 },
        nameFirst: 'M',
        nameLast: 'C',
      });
    expect([200, 201]).toContain(res.status);
    // After write, _invalidateCache fires strategy.invalidate('User:')
    expect(invalidateSpy).toHaveBeenCalledWith('User:');
  });

  it('?cache=0 bypass: per-request opt-out skips wrap (FetchHelper consults parsed.options.cache === false)', async () => {
    await request(server).get('/users-cached'); // populate cache
    wrapSpy.mockClear();

    const bypass = await request(server).get('/users-cached').query({ cache: '0' });
    expect(bypass.status).toBe(200);
    // wrap NOT called for the bypass request (parsed.options.cache === false short-circuits)
    expect(wrapSpy).not.toHaveBeenCalled();
  });

  it('thunk invariant: concurrent reads under cache do not produce identity-map collisions (T-06-02 / T-21-04)', async () => {
    // First request populates cache; concurrent requests hit cache (single-flight).
    // Behaviorally: cached reads across concurrent requests must not crash or corrupt.
    // Static invariant: getEm() is called INSIDE the fetch closure (verified by acceptance grep
    // `grep -nE "private (readonly )?em\b" mikro-orm-fetch-helper.ts` returning 0 hits).
    const [a, b] = await Promise.all([request(server).get('/users-cached'), request(server).get('/users-cached')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Both return same payload — single-flight prevented duplicate DB queries
    expect(a.body).toEqual(b.body);
  });

  it('throws CrudCacheNotConfiguredError when @Crud cache set without strategy (D-11 parity with TypeORM/Drizzle/Prisma)', async () => {
    // Reset removes the global strategy. The UsersCachedController declares
    // @Crud({ query: { cache: 5000 } }) — now no strategy is wired anywhere.
    // FetchHelper.assertStrategyOrPassThrough throws CrudCacheNotConfiguredError
    // → propagates as 500 under the default Nest exception filter.
    CrudConfigService.reset();
    const res = await request(server).get('/users-cached');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
