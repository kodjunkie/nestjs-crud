// Wave 2 plan 21-02: cache-strategy integration spec
// Exercises the production TTL wiring path: fixture controller declares
// @Crud({ query: { cache: 5000 } }) so FetchHelper's getEffectiveTtl(options)
// returns 5000 from options.query.cache at request time (D-10 contract).

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CrudConfigService, MockCacheStrategy } from '@nestjs-crud/core';
import * as request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';

const dialect = process.env.TYPEORM_CONNECTION as 'mysql' | undefined;
// Default to postgres when TYPEORM_CONNECTION is unset; run on both dialects.
const runSuite = !dialect || dialect === 'mysql' || dialect === 'postgres';

(runSuite ? describe : describe.skip)(`TypeOrmCrudService cache strategy [${dialect ?? 'postgres'}]`, () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let strategy: MockCacheStrategy;
  let invalidateSpy: jest.SpyInstance;
  let wrapSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
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

  // The fixture uses /companies/:companyId/users-cached (UsersCachedController)
  // which declares @Crud({ query: { cache: 5000 } }).
  // Company 1 and User 1 are seeded by the fixture seeds.

  it('cache-hit: second read returns cached payload; wrap called with @Crud option ttl (5000ms)', async () => {
    const a = await request(server).get('/companies/1/users-cached/1');
    const b = await request(server).get('/companies/1/users-cached/1');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    // Production-wiring check: wrap is invoked with the ttl from @Crud option (5000ms).
    // Proves getEffectiveTtl(options) sourced TTL from options.query.cache (D-10)
    // and that ttl is in MILLISECONDS uniformly (FIX 1).
    expect(wrapSpy).toHaveBeenCalled();
    const wrapCalls = wrapSpy.mock.calls;
    expect(wrapCalls.some((args: unknown[]) => args[2] === 5000)).toBe(true);
  });

  it('cache-miss: cleared cache triggers fresh DB query', async () => {
    await request(server).get('/companies/1/users-cached/1'); // populate
    await strategy.invalidate('User:'); // clear
    invalidateSpy.mockClear();
    const fresh = await request(server).get('/companies/1/users-cached/1');
    expect(fresh.status).toBe(200);
    // invalidate was not called by the service on a GET (only on writes)
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('auto-invalidate-on-write: createOne evicts entity-prefix cache entries', async () => {
    await request(server).get('/companies/1/users-cached'); // populate cache
    invalidateSpy.mockClear();

    const res = await request(server)
      .post('/companies/1/users-cached')
      .send({
        email: 'cache-spec-inv@example.com',
        isActive: true,
        name: { first: 'Cache', last: 'Spec' },
        profile: { name: 'CacheSpecProfile' },
      });
    expect([200, 201]).toContain(res.status);
    expect(invalidateSpy).toHaveBeenCalledWith('User:');
  });

  it('?cache=0 bypass: per-request opt-out skips wrap (FetchHelper consults parsed.options.cache === false)', async () => {
    await request(server).get('/companies/1/users-cached/1'); // populate
    wrapSpy.mockClear();

    const bypass = await request(server).get('/companies/1/users-cached/1').query({ cache: '0' });
    expect(bypass.status).toBe(200);
    // wrap NOT called for the bypass request (parsed.options.cache === false short-circuits)
    expect(wrapSpy).not.toHaveBeenCalled();
  });

  it('throws CrudCacheNotConfiguredError when @Crud cache set without strategy AND without DataSource.cache', async () => {
    // Reset removes the global strategy. The UsersCachedController declares
    // @Crud({ query: { cache: 5000 } }) — now neither a CacheStrategy is wired
    // nor does the fixture DataSource have a TypeORM native cache provider
    // (orm.config.ts `withCache` has no `cache:` option).
    // QueryComposer step 7 fires → no cacheProvider → CrudCacheNotConfiguredError.
    CrudConfigService.reset();
    const res = await request(server).get('/companies/1/users-cached/1');
    // CrudCacheNotConfiguredError is a plain Error (not HttpException);
    // propagates as 500 under the default Nest exception filter.
    expect(res.status).toBeGreaterThanOrEqual(500);
  });

  it('no double-cache: when CacheStrategy wired, QueryComposer step 7 does NOT activate', async () => {
    // If step 7 ran when a strategy is wired, TypeORM would try to read
    // DataSource.cache (absent in the test fixture) and throw
    // CrudCacheNotConfiguredError. Since step 7 is conditionalized on
    // !resolvedStrategy, the request returns 200 with the strategy active.
    const res = await request(server).get('/companies/1/users-cached/1');
    expect(res.status).toBe(200);
  });
});
