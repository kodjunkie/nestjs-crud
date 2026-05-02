import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from './__fixture__/app/app.module';

const provider = process.env.PRISMA_PROVIDER as 'postgresql' | 'mysql' | undefined;
const runSuite = provider === 'postgresql' || provider === 'mysql';
const dialect = (provider === 'mysql' ? 'mysql' : 'postgres') as 'postgres' | 'mysql';

(runSuite ? describe : describe.skip)(`PrismaCrudService cursor pagination [${provider ?? 'skipped'}]`, () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app?.close();
  });

  // Wave 0 — todos turned into real it() cells in Plan 05
  it.todo('forward navigation across 3 pages returns no skip/repeat rows — Plan 05');
  it.todo('end-of-stream returns cursor.next === null — Plan 05');
  it.todo('back-direction cursor returns prior page in correct order — Plan 05');
  it.todo('round-trip forward+back returns identical rows — Plan 05');
  it.todo('cursor stable when row inserted mid-pagination — Plan 05');
  it.todo('multi-sort + cursor returns 400 BadRequest — Plan 05');
  it.todo('invalid cursor returns 400 BadRequest "Invalid cursor" — Plan 05');
  it.todo('@CrudAuth filter still applies in cursor mode — Plan 05');
  it.todo('soft-delete still applies in cursor mode — Plan 05');
  it.todo('response shape has no total/page/pageCount keys — Plan 05');
  it.todo('SQLi guard rejects ?sort=x;DROP via existing allowlist — Plan 05');
  it.todo('descending sort works symmetrically — Plan 05');
  it.todo('PK tie-breaker on createdAt ties returns deterministic order — Plan 05');
  it.todo('cursor mode bypasses Phase 21 cache wrap — Plan 05');
  it.todo('missing limit + cursor mode returns 400 BadRequest — Plan 05');

  // Reference server in placeholder so unused-var lint does not complain on the stub
  // dialect is used in the describe label above; void here to keep it referenced
  void dialect;
  it('app boots', () => { expect(server).toBeDefined(); });
});
