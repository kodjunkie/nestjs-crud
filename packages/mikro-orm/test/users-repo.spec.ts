import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import request from 'supertest';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';
import { seedAll } from './__fixture__/seeds';

// Only run this suite when a real dialect is targeted.
// `yarn test:mikro-orm:postgres` sets MIKRO_ORM_DIALECT=postgres.
// `yarn test:mikro-orm:mysql` sets MIKRO_ORM_DIALECT=mysql.
// Running without dialect (e.g. bare `yarn test:mikro-orm`) skips the suite.
const dialect = process.env.MIKRO_ORM_DIALECT as 'postgres' | 'mysql' | undefined;
const runSuite = dialect === 'postgres' || dialect === 'mysql';

(runSuite ? describe : describe.skip)(
  `UsersRepo (serviceProperty + repo ctor) [${dialect ?? 'skipped'}]`,
  () => {
    let app: INestApplication;
    let server: any;
    let orm: MikroORM;

    beforeAll(async () => {
      // Standalone MikroORM instance for seeding — initialized directly so the schema
      // extension from @mikro-orm/postgresql or @mikro-orm/mysql is properly registered.
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
      // Reseed before each test: drops + recreates schema + inserts canonical data
      await seedAll(orm);
    });

    it('getMany returns seeded users via /users-repo', (done) => {
      request(server)
        .get('/users-repo')
        .end((_, res) => {
          expect(res.status).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          done();
        });
    });

    it('getOne(1) returns the seeded user with id=1 via /users-repo/1', (done) => {
      request(server)
        .get('/users-repo/1')
        .end((_, res) => {
          expect(res.status).toBe(200);
          expect(res.body.id).toBe(1);
          expect(res.body.email).toBe('1@email.com');
          done();
        });
    });

    it('createOne adds a new user via the repo-injected service', async () => {
      const dto = {
        email: 'repo-create@example.test',
        password: 'secret',
        isActive: true,
        company: { id: 1 },
        nameFirst: 'Repo',
        nameLast: 'Create',
      };

      const createRes = await request(server).post('/users-repo').send(dto);
      expect(createRes.status).toBe(201);
      expect(createRes.body.id).toBeTruthy();
      expect(createRes.body.email).toBe('repo-create@example.test');
    });

    it('updateOne patches an existing user via /users-repo/2', async () => {
      const updateRes = await request(server).patch('/users-repo/2').send({ nameFirst: 'RepoUpdated' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.id).toBe(2);
      expect(updateRes.body.nameFirst).toBe('RepoUpdated');
    });

    it('deleteOne removes an existing user via /users-repo/3', async () => {
      const deleteRes = await request(server).delete('/users-repo/3');
      expect(deleteRes.status).toBe(200);

      // Hard delete (no softDelete on this controller) — user should be 404 after
      const getRes = await request(server).get('/users-repo/3');
      expect(getRes.status).toBe(404);
    });
  },
);
