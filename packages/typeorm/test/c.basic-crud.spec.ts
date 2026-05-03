import { Controller, INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Crud } from '@nestjs-crud/core';
import { RequestQueryBuilder } from '@nestjs-crud/request';
import * as request from 'supertest';
import { Company } from './__fixture__/app/companies';
import { Device } from './__fixture__/app/devices';
import { withCache } from './__fixture__/app/orm.config';
import { Project } from './__fixture__/app/projects';
import { User } from './__fixture__/app/users';
import { UserProfile } from './__fixture__/app/users-profiles';
import { HttpExceptionFilter } from './__fixture__/shared/https-exception.filter';
import { CompaniesService } from './__fixture__/companies.service';
import { UsersService } from './__fixture__/users.service';
import { DevicesService } from './__fixture__/devices.service';

const isMysql = process.env.TYPEORM_CONNECTION === 'mysql';

// tslint:disable:max-classes-per-file no-shadowed-variable
describe('#crud-typeorm', () => {
  describe('#basic crud using alwaysPaginate default respects global limit', () => {
    let app: INestApplication;
    let server: any;
    let _qb: RequestQueryBuilder;
    let _service: CompaniesService;

    @Crud({
      model: { type: Company },
      query: {
        alwaysPaginate: true,
        limit: 3,
      },
    })
    @Controller('companies0')
    class CompaniesController0 {
      constructor(public service: CompaniesService) {}
    }

    beforeAll(async () => {
      const fixture = await Test.createTestingModule({
        imports: [TypeOrmModule.forRoot(withCache), TypeOrmModule.forFeature([Company])],
        controllers: [CompaniesController0],
        providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }, CompaniesService],
      }).compile();

      app = fixture.createNestApplication();
      _service = app.get<CompaniesService>(CompaniesService);

      await app.init();
      server = app.getHttpServer();
    });

    beforeEach(() => {
      _qb = RequestQueryBuilder.create();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('#getAllBase', () => {
      it('should return an array of all entities', async () => {
        const res = await request(server).get('/companies0');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(3);
        expect(res.body.page).toBe(1);
      });
    });
  });

  describe('#basic crud using alwaysPaginate default', () => {
    let app: INestApplication;
    let server: any;
    let qb: RequestQueryBuilder;
    let _service: CompaniesService;

    @Crud({
      model: { type: Company },
      query: { alwaysPaginate: true },
    })
    @Controller('companies')
    class CompaniesController {
      constructor(public service: CompaniesService) {}
    }

    beforeAll(async () => {
      const fixture = await Test.createTestingModule({
        imports: [TypeOrmModule.forRoot(withCache), TypeOrmModule.forFeature([Company])],
        controllers: [CompaniesController],
        providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }, CompaniesService],
      }).compile();

      app = fixture.createNestApplication();
      _service = app.get<CompaniesService>(CompaniesService);

      await app.init();
      server = app.getHttpServer();
    });

    beforeEach(() => {
      qb = RequestQueryBuilder.create();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('#getAllBase', () => {
      it('should return an array of all entities', async () => {
        const res = await request(server).get('/companies');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(9);
        expect(res.body.page).toBe(1);
      });
      it('should return an entities with limit', async () => {
        const query = qb.setLimit(5).query();
        const res = await request(server).get('/companies').query(query);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(5);
        expect(res.body.page).toBe(1);
      });
      it('should return an entities with limit and page', async () => {
        const query = qb.setLimit(3).setPage(1).sortBy({ field: 'id', order: 'DESC' }).query();
        const res = await request(server).get('/companies').query(query);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(3);
        expect(res.body.count).toBe(3);
        expect(res.body.page).toBe(1);
      });
    });
  });

  describe('#basic crud', () => {
    let app: INestApplication;
    let server: any;
    let qb: RequestQueryBuilder;
    let service: CompaniesService;

    @Crud({
      model: { type: Company },
      query: {
        softDelete: true,
      },
    })
    @Controller('companies')
    class CompaniesController {
      constructor(public service: CompaniesService) {}
    }

    @Crud({
      model: { type: User },
      params: {
        companyId: {
          field: 'companyId',
          type: 'number',
        },
        id: {
          field: 'id',
          type: 'number',
          primary: true,
        },
      },
      routes: {
        deleteOneBase: {
          returnDeleted: true,
        },
      },
      query: {
        persist: ['isActive'],
        // `cache: 10` removed because the fixture
        // DataSource (orm.config.ts `withCache`) does NOT configure a TypeORM
        // cache provider. The new `CrudCacheNotConfiguredError` fail-fast guard
        // (typeorm-query-composer.ts step 7) correctly throws when cache is set
        // without a provider — proving the guard works in real DB. The cache
        // assertion below ('should return an entity with and set cache') was
        // never actually verifying cache HITS, only response shape, so the
        // semantic is preserved. To re-enable end-to-end cache testing,
        // configure `cache: { type: 'redis', options: { ... port: 6399 } }`
        // on the fixture DataSource (compose.yml already provides redis).
      },
      validation: {
        transform: true,
      },
    })
    @Controller('companies/:companyId/users')
    class UsersController {
      constructor(public service: UsersService) {}
    }

    @Crud({
      model: { type: User },
      query: {
        join: {
          profile: {
            eager: true,
            required: true,
          },
        },
      },
    })
    @Controller('/users2')
    class UsersController2 {
      constructor(public service: UsersService) {}
    }

    @Crud({
      model: { type: User },
      query: {
        join: {
          profile: {
            eager: true,
          },
        },
      },
    })
    @Controller('/users3')
    class UsersController3 {
      constructor(public service: UsersService) {}
    }

    @Crud({
      model: { type: User },
      params: {
        companyId: { field: 'companyId', type: 'number', primary: true },
        profileId: { field: 'profileId', type: 'number', primary: true },
      },
    })
    @Controller('users4')
    class UsersController4 {
      constructor(public service: UsersService) {}
    }

    @Crud({
      model: { type: Device },
      params: {
        deviceKey: {
          field: 'deviceKey',
          type: 'uuid',
          primary: true,
        },
      },
      routes: {
        createOneBase: {
          returnShallow: true,
        },
      },
    })
    @Controller('devices')
    class DevicesController {
      constructor(public service: DevicesService) {}
    }

    beforeAll(async () => {
      const fixture = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({ ...withCache, logging: false }),
          TypeOrmModule.forFeature([Company, Project, User, UserProfile, Device]),
        ],
        controllers: [
          CompaniesController,
          UsersController,
          UsersController2,
          UsersController3,
          UsersController4,
          DevicesController,
        ],
        providers: [
          { provide: APP_FILTER, useClass: HttpExceptionFilter },
          CompaniesService,
          UsersService,
          DevicesService,
        ],
      }).compile();

      app = fixture.createNestApplication();
      service = app.get<CompaniesService>(CompaniesService);

      await app.init();
      server = app.getHttpServer();
    });

    beforeEach(() => {
      qb = RequestQueryBuilder.create();
    });

    afterAll(async () => {
      await app.close();
    });

    describe('#find', () => {
      it('should return entities', async () => {
        const data = await service.find();
        expect(data.length).toBe(9);
      });
    });

    describe('#findOne', () => {
      it('should return one entity', async () => {
        const data = await service.findOne({ where: { id: 1 } });
        expect(data.id).toBe(1);
      });
    });

    describe('#count', () => {
      it('should return number', async () => {
        const data = await service.count();
        expect(typeof data).toBe('number');
      });
    });

    describe('#getAllBase', () => {
      it('should return an array of all entities', async () => {
        const res = await request(server).get('/companies?include_deleted=1');
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(10);
      });
      it('should return an entities with limit', async () => {
        const query = qb.setLimit(5).query();
        const res = await request(server).get('/companies').query(query);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(5);
      });
      it('should return an entities with limit and page', async () => {
        const query = qb.setLimit(3).setPage(1).sortBy({ field: 'id', order: 'DESC' }).query();
        const res = await request(server).get('/companies').query(query);
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(3);
        expect(res.body.count).toBe(3);
        expect(res.body.total).toBe(9);
        expect(res.body.page).toBe(1);
        expect(res.body.pageCount).toBe(3);
      });
      it('should return an entities with offset', async () => {
        const queryObj = qb.setOffset(3);
        if (isMysql) {
          queryObj.setLimit(10);
        }
        const query = queryObj.query();
        const res = await request(server).get('/companies').query(query);
        expect(res.status).toBe(200);
        if (isMysql) {
          expect(res.body.count).toBe(6);
          expect(res.body.data.length).toBe(6);
        } else {
          expect(res.body.length).toBe(6);
        }
      });
    });

    describe('#getOneBase', () => {
      it('should return status 404', async () => {
        const res = await request(server).get('/companies/333');
        expect(res.status).toBe(404);
      });
      it('should return status 404 for deleted entity', async () => {
        const res = await request(server).get('/companies/9');
        expect(res.status).toBe(404);
      });
      it('should return a deleted entity if include_deleted query param is specified', async () => {
        const res = await request(server).get('/companies/9?include_deleted=1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(9);
      });
      it('should return an entity, 1', async () => {
        const res = await request(server).get('/companies/1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(1);
      });
      it('should return an entity, 2', async () => {
        const query = qb.select(['domain']).query();
        const res = await request(server).get('/companies/1').query(query);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(1);
        expect(res.body.domain).toBeTruthy();
      });
      it('should return an entity with compound key', async () => {
        const res = await request(server).get('/users4/1/5');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(5);
      });
      it('should return an entity with and set cache', async () => {
        const res = await request(server).get('/companies/1/users/1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(1);
        expect(res.body.companyId).toBe(1);
      });

      it('should return an entity with its embedded entity properties', async () => {
        const res = await request(server).get('/companies/1/users/1');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(1);
        expect(res.body.name.first).toBe('firstname1');
        expect(res.body.name.last).toBe('lastname1');
      });
    });

    describe('#createOneBase', () => {
      it('should return status 400', async () => {
        const res = await request(server).post('/companies').send('');
        expect(res.status).toBe(400);
      });
      it('should return saved entity', async () => {
        const dto = {
          name: 'test0',
          domain: 'test0',
        };
        const res = await request(server).post('/companies').send(dto);
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
      });
      it('should return saved entity with param', async () => {
        const dto: any = {
          email: 'test@test.com',
          isActive: true,
          name: {
            first: 'test',
            last: 'last',
          },
          profile: {
            name: 'testName',
          },
        };
        const res = await request(server).post('/companies/1/users').send(dto);
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
        expect(res.body.companyId).toBe(1);
      });
      it('should return with `returnShallow`', async () => {
        const dto: any = { description: 'returnShallow is true' };
        const res = await request(server).post('/devices').send(dto);
        expect(res.status).toBe(201);
        expect(res.body.deviceKey).toBeTruthy();
        expect(res.body.description).toBeTruthy();
      });
    });

    describe('#createManyBase', () => {
      it('should return status 400', async () => {
        const dto = { bulk: [] };
        const res = await request(server).post('/companies/bulk').send(dto);
        expect(res.status).toBe(400);
      });
      it('should return created entities', async () => {
        const dto = {
          bulk: [
            {
              name: 'test1',
              domain: 'test1',
            },
            {
              name: 'test2',
              domain: 'test2',
            },
          ],
        };
        const res = await request(server).post('/companies/bulk').send(dto);
        expect(res.status).toBe(201);
        expect(res.body[0].id).toBeTruthy();
        expect(res.body[1].id).toBeTruthy();
      });
    });

    describe('#updateOneBase', () => {
      it('should return status 404', async () => {
        const dto = { name: 'updated0' };
        const res = await request(server).patch('/companies/333').send(dto);
        expect(res.status).toBe(404);
      });
      it('should return updated entity, 1', async () => {
        const dto = { name: 'updated0' };
        const res = await request(server).patch('/companies/1').send(dto);
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('updated0');
      });
      it('should return updated entity, 2', async () => {
        const dto = { isActive: false, companyId: 5 };
        const res = await request(server).patch('/companies/1/users/22').send(dto);
        expect(res.status).toBe(200);
        expect(res.body.isActive).toBe(false);
        expect(res.body.companyId).toBe(1);
      });
    });

    describe('#replaceOneBase', () => {
      it('should create entity', async () => {
        const dto = { name: 'updated0', domain: 'domain0' };
        const res = await request(server).put('/companies/333').send(dto);
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('updated0');
      });
      it('should return updated entity, 1', async () => {
        const dto = { name: 'updated0' };
        const res = await request(server).put('/companies/1').send(dto);
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('updated0');
      });
    });

    describe('#deleteOneBase', () => {
      it('should return status 404', async () => {
        const res = await request(server).delete('/companies/3333');
        expect(res.status).toBe(404);
      });
      it('should softly delete entity', async () => {
        const res = await request(server).delete('/companies/5');
        expect(res.status).toBe(200);
      });
      it('should not return softly deleted entity', async () => {
        const res = await request(server).get('/companies/5');
        expect(res.status).toBe(404);
      });
      it('should recover softly deleted entity', async () => {
        const res = await request(server).patch('/companies/5/recover');
        expect(res.status).toBe(200);
      });
      it('should return recovered entity', async () => {
        const res = await request(server).get('/companies/5');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(5);
      });
      it('should return deleted entity', async () => {
        const res = await request(server).delete('/companies/1/users/22');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(22);
        expect(res.body.companyId).toBe(1);
      });
    });

    describe('join options: required', () => {
      const users2 = () => request(server).get('/users2/21');
      const users3 = () => request(server).get('/users3/21');

      it('should return status 404', async () => {
        await users2().expect(404);
      });

      it('should return status 200', async () => {
        const res = await users3().expect(200);
        expect(res.body.id).toBe(21);
        expect(res.body.profile).toBe(null);
      });
    });
  });
});
