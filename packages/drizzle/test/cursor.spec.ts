import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from './__fixture__/app/app.module';

const dialect = process.env.DRIZZLE_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(`DrizzleCrudService cursor pagination [${dialect ?? 'skipped'}]`, () => {
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

  // Wave 0 — todos turned into real it() cells in Plan 03
  it.todo('forward navigation across 3 pages returns no skip/repeat rows — Plan 03');
  it.todo('end-of-stream returns cursor.next === null — Plan 03');
  it.todo('back-direction cursor returns prior page in correct order — Plan 03');
  it.todo('round-trip forward+back returns identical rows — Plan 03');
  it.todo('cursor stable when row inserted mid-pagination — Plan 03');
  it.todo('multi-sort + cursor returns 400 BadRequest — Plan 03');
  it.todo('invalid cursor returns 400 BadRequest "Invalid cursor" — Plan 03');
  it.todo('@CrudAuth filter still applies in cursor mode — Plan 03');
  it.todo('soft-delete still applies in cursor mode — Plan 03');
  it.todo('response shape has no total/page/pageCount keys — Plan 03');
  it.todo('SQLi guard rejects ?sort=x;DROP via existing allowlist — Plan 03');
  it.todo('descending sort works symmetrically — Plan 03');
  it.todo('PK tie-breaker on createdAt ties returns deterministic order — Plan 03');
  it.todo('cursor mode bypasses Phase 21 cache wrap — Plan 03');
  it.todo('missing limit + cursor mode returns 400 BadRequest — Plan 03');

  // Reference server in placeholder so unused-var lint does not complain on the stub
  it('app boots', () => { expect(server).toBeDefined(); });
});
