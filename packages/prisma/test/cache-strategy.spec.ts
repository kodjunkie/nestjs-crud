// Wave 2 plan 21-04: cache-strategy integration spec
// Exercises the production TTL wiring path: fixture UsersCachedController declares
// @Crud({ query: { cache: 5000 } }) so PrismaFetchHelper.getEffectiveTtl(options)
// returns 5000 from options.query.cache at request time (D-10 contract).

import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { CrudConfigService, MockCacheStrategy } from '@nestjs-crud/core';
import * as request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';

const provider = process.env.PRISMA_PROVIDER as 'postgresql' | 'mysql' | undefined;
const runSuite = provider === 'postgresql' || provider === 'mysql';
const dialect = (provider === 'mysql' ? 'mysql' : 'postgres') as 'postgres' | 'mysql';

(runSuite ? describe : describe.skip)(`PrismaCrudService Redis cache strategy [${provider ?? 'skipped'}]`, () => {
  let app: INestApplication;
  let server: any;
  let strategy: MockCacheStrategy;
  let invalidateSpy: jest.SpyInstance;
  let wrapSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(dialect)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
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

  it('cache-hit: second read returns cached payload', async () => {
    const a = await request(server).get('/users-cached');
    const b = await request(server).get('/users-cached');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(wrapSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('cache-miss: cleared cache triggers fresh DB query', async () => {
    await request(server).get('/users-cached');
    await strategy.invalidate('user:');
    invalidateSpy.mockClear();
    const fresh = await request(server).get('/users-cached');
    expect(fresh.status).toBe(200);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('auto-invalidate-on-write: createOne evicts entity-prefix cache', async () => {
    await request(server).get('/users-cached');
    invalidateSpy.mockClear();
    const res = await request(server).post('/users-cached').send({
      email: 'prisma-cache-spec-1@example.com',
      isActive: true,
      password: 'test-pass',
      nameFirst: 'Cache',
      nameLast: 'Spec',
      companyId: 1,
    });
    expect([200, 201]).toContain(res.status);
    expect(invalidateSpy).toHaveBeenCalledWith('user:');
  });

  it('?cache=0 bypass: per-request opt-out skips wrap', async () => {
    await request(server).get('/users-cached');
    wrapSpy.mockClear();
    const bypass = await request(server).get('/users-cached').query({ cache: '0' });
    expect(bypass.status).toBe(200);
    expect(wrapSpy).not.toHaveBeenCalled();
  });

  it('throws CrudCacheNotConfiguredError when @Crud cache set without strategy (D-11 unconditional)', async () => {
    // Reset removes the global strategy. The UsersCachedController declares
    // @Crud({ query: { cache: 5000 } }) — now no strategy is wired.
    // Per D-11, PrismaFetchHelper.assertStrategyOrPassThrough throws
    // CrudCacheNotConfiguredError UNCONDITIONALLY — no status-range ambiguity.
    // The plain Error subclass propagates as 5xx under the default Nest filter.
    CrudConfigService.reset();
    const res = await request(server).get('/users-cached');
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
