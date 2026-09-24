import { INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import {
  CANONICAL_SEED_COMPANIES,
  CANONICAL_SEED_USERS,
  CANONICAL_SEED_PROJECTS,
} from '../../core/test/__shared-fixture__/canonical-entities';

import { AppModule } from './__fixture__/app/app.module';
import { HttpExceptionFilter } from './__fixture__/app/http-exception.filter';
import { PRISMA_CLIENT } from './__fixture__/app/users.service';

const provider = process.env.PRISMA_PROVIDER as 'postgresql' | 'mysql' | undefined;
const runSuite = provider === 'postgresql' || provider === 'mysql';
const dialect = (provider === 'mysql' ? 'mysql' : 'postgres') as 'postgres' | 'mysql';

// ---------------------------------------------------------------------------
// DB reseed helper — truncates + re-inserts canonical seed before each cell.
// Same shape as cursor.spec.ts's reseedDb.
// ---------------------------------------------------------------------------
async function reseedDb(prisma: any, db: 'postgres' | 'mysql'): Promise<void> {
  if (db === 'mysql') {
    // v7 driver-adapter pools per statement — DELETE in child-first FK-safe order.
    await prisma.$executeRawUnsafe('DELETE FROM Project');
    await prisma.$executeRawUnsafe('DELETE FROM User');
    await prisma.$executeRawUnsafe('DELETE FROM Company');
    await prisma.$executeRawUnsafe('ALTER TABLE `Project` AUTO_INCREMENT = 1');
    await prisma.$executeRawUnsafe('ALTER TABLE `User` AUTO_INCREMENT = 1');
    await prisma.$executeRawUnsafe('ALTER TABLE `Company` AUTO_INCREMENT = 1');
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

(runSuite ? describe : describe.skip)(`PrismaCrudService route defaults [${dialect}]`, () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let seedPrisma: any;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule.forRoot(dialect)],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    }).compile();

    app = fixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();

    // Standalone Prisma client for reseeding — owned by the spec, not NestJS DI.
    const { makePrismaClient } = require('./__fixture__/make-prisma-client');
    seedPrisma = makePrismaClient(dialect);
  });

  afterAll(async () => {
    if (seedPrisma) {
      await seedPrisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await reseedDb(seedPrisma, dialect);
  });

  it('offset mode with no ?sort= falls back to the route default sort (id DESC)', async () => {
    const prismaClient = app.get(PRISMA_CLIENT) as any;
    const findManySpy = jest.spyOn(prismaClient.user, 'findMany');
    try {
      const { body } = await request(server).get('/users-route-defaults').expect(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      const ids = body.map((r: any) => r.id);
      const sortedDesc = [...ids].sort((a, b) => b - a);
      expect(ids).toEqual(sortedDesc);

      const lastCall = findManySpy.mock.calls[findManySpy.mock.calls.length - 1] as any[];
      expect(lastCall[0].orderBy).toEqual([{ id: 'desc' }]);
    } finally {
      findManySpy.mockRestore();
    }
  });

  it('a request ?sort= replaces the route default entirely (no merge)', async () => {
    const prismaClient = app.get(PRISMA_CLIENT) as any;
    const findManySpy = jest.spyOn(prismaClient.user, 'findMany');
    try {
      const { body } = await request(server).get('/users-route-defaults?sort=id,ASC').expect(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      const ids = body.map((r: any) => r.id);
      const sortedAsc = [...ids].sort((a, b) => a - b);
      expect(ids).toEqual(sortedAsc);

      const lastCall = findManySpy.mock.calls[findManySpy.mock.calls.length - 1] as any[];
      expect(lastCall[0].orderBy).toEqual([{ id: 'asc' }]);
    } finally {
      findManySpy.mockRestore();
    }
  });

  it('the non-eager company join option is not included when the request does not ask for it', async () => {
    const prismaClient = app.get(PRISMA_CLIENT) as any;
    const findManySpy = jest.spyOn(prismaClient.user, 'findMany');
    try {
      const { body } = await request(server).get('/users-route-defaults').expect(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      for (const row of body) {
        expect(row).not.toHaveProperty('company');
      }

      const lastCall = findManySpy.mock.calls[findManySpy.mock.calls.length - 1] as any[];
      expect(lastCall[0].include).toBeUndefined();
    } finally {
      findManySpy.mockRestore();
    }
  });

  it('?join=company includes the company relation, matching companyId', async () => {
    const prismaClient = app.get(PRISMA_CLIENT) as any;
    const findManySpy = jest.spyOn(prismaClient.user, 'findMany');
    try {
      const { body } = await request(server).get('/users-route-defaults?join=company').expect(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      for (const row of body) {
        expect(row.company).toBeDefined();
        expect(row.company.id).toBe(row.companyId);
      }

      const lastCall = findManySpy.mock.calls[findManySpy.mock.calls.length - 1] as any[];
      expect(lastCall[0].include).toEqual({ company: true });
    } finally {
      findManySpy.mockRestore();
    }
  });
});
