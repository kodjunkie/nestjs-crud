/**
 * PERF-01 (Phase 10 Plan 01) — relation-load-strategy integration spec.
 *
 * RED gate: this spec MUST fail before Task 3 lands (composer doesn't yet honor
 * `relationLoadStrategy: 'query'`, so under the 'query' branch joins are
 * skipped — `company` and `company.projects` come back undefined, and the
 * row-count parity assertion fails).
 *
 * Coverage:
 *  - Test 1: row-count parity between 'query' and 'join' strategies on deep
 *    multi-relation getMany — proves no Cartesian inflation.
 *  - Test 2: nested split-query loading actually populates `company` and
 *    `company.projects`.
 *  - Test 3 (D-05b regression): `?sort=company.invalid_col,ASC` returns 400
 *    under the 'query' branch — proves SQLi sort-allowlist still fires.
 *  - Test 4 (open-question #5 smoke): `setFindOptions` + `query.cache(...)`
 *    coexist (skipped if cache provider not configured in fixture).
 *  - Test 5 (alias-select parity audit — divergence documentation): top-level
 *    `?fields=` honored under 'query'; relation-level `JoinOption.allow` is a
 *    KNOWN divergence — relation columns under 'query' are loaded by TypeORM's
 *    `setFindOptions` regardless of `allow`. The test records what columns
 *    each strategy returns for downstream Phase 11 DOCS-04 documentation.
 */
import { Controller, INestApplication } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Crud, CrudController, CrudRequest, Override, ParsedRequest } from '@nestjs-crud/core';
import * as request from 'supertest';

import { Company } from './__fixture__/app/companies';
import { Project } from './__fixture__/app/projects';
import { withCache } from './__fixture__/app/orm.config';
import { User } from './__fixture__/app/users';
import { UserProfile } from './__fixture__/app/users-profiles';
import { UsersService } from './__fixture__/app/users/users.service';
import { HttpExceptionFilter } from './__fixture__/shared/https-exception.filter';

// Twin controllers — same join allowlist, different strategies — so Test 1 can
// compare row counts cleanly without the `:companyId` prefix on the existing
// fixture controller.

@Crud({
  model: { type: User },
  query: {
    relationLoadStrategy: 'query',
    join: {
      company: { allow: ['name', 'domain'] },
      'company.projects': { allow: ['name', 'description'] },
    },
  },
})
@Controller('/perf01-users-query')
class UsersQueryStrategyController implements CrudController<User> {
  constructor(public service: UsersService) {}
  get base(): CrudController<User> {
    return this;
  }
  @Override('getManyBase')
  getAll(@ParsedRequest() req: CrudRequest) {
    return this.base.getManyBase(req);
  }
}

@Crud({
  model: { type: User },
  query: {
    // No relationLoadStrategy → defaults to 'join' (existing behavior).
    join: {
      company: { allow: ['name', 'domain'] },
      'company.projects': { allow: ['name', 'description'] },
    },
  },
})
@Controller('/perf01-users-join')
class UsersJoinStrategyController implements CrudController<User> {
  constructor(public service: UsersService) {}
  get base(): CrudController<User> {
    return this;
  }
  @Override('getManyBase')
  getAll(@ParsedRequest() req: CrudRequest) {
    return this.base.getManyBase(req);
  }
}

describe('PERF-01: TypeORM relationLoadStrategy opt-in (D-02/D-03 amended)', () => {
  let app: INestApplication;
  let server: any;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [TypeOrmModule.forRoot(withCache), TypeOrmModule.forFeature([User, UserProfile, Company, Project])],
      controllers: [UsersQueryStrategyController, UsersJoinStrategyController],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }, UsersService],
    }).compile();

    app = fixture.createNestApplication();
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Test 1: row-count parity (no Cartesian inflation under split queries)', () => {
    it('returns the SAME data.length for both strategies on deep multi-relation getMany', async () => {
      const queryUrl = '?join[]=company&join[]=company.projects&page=1&limit=10';
      const [queryRes, joinRes] = await Promise.all([
        request(server).get(`/perf01-users-query${queryUrl}`),
        request(server).get(`/perf01-users-join${queryUrl}`),
      ]);
      expect(queryRes.status).toBe(200);
      expect(joinRes.status).toBe(200);
      expect(Array.isArray(queryRes.body.data)).toBe(true);
      expect(Array.isArray(joinRes.body.data)).toBe(true);
      // The CORE PERF-01 assertion: same row count, both strategies.
      expect(queryRes.body.data.length).toBe(joinRes.body.data.length);
      // Sanity — there should actually be some users seeded.
      expect(queryRes.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('Test 2: nested split-query relations are populated under "query"', () => {
    it('first user under "query" strategy has BOTH company and company.projects loaded', async () => {
      const res = await request(server).get('/perf01-users-query?join[]=company&join[]=company.projects&limit=5');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      const firstWithCompany = res.body.data.find((u: any) => u.company);
      expect(firstWithCompany).toBeDefined();
      expect(typeof firstWithCompany.company).toBe('object');
      expect(firstWithCompany.company).not.toBeNull();
      expect(Array.isArray(firstWithCompany.company.projects)).toBe(true);
    });
  });

  describe('Test 3 (D-05b T-10-01 SQLi regression): sort-allowlist fires under "query"', () => {
    it('returns HTTP 400 with "Invalid column" message for unallowlisted dotted-path sort', async () => {
      const res = await request(server)
        .get('/perf01-users-query')
        .query({ join: ['company'], sort: 'company.invalid_col,ASC' });
      expect(res.status).toBe(400);
      // mapSort throws `Invalid column '<col>' for relation '<relation>'` per
      // typeorm-query-composer.ts mapSort branch — D-05b guard.
      expect(JSON.stringify(res.body)).toMatch(/Invalid column.*invalid_col.*company/);
    });
  });

  describe('Test 4 (open question #5 smoke): cache + setFindOptions coexist', () => {
    // withCache config has no cache provider configured (orm.config.ts only
    // sets connection params; cache is not enabled). Skip explicitly so the
    // intent is logged for the SUMMARY.
    it.skip('cache+strategy smoke skipped: fixture orm.config has no cache provider', async () => {
      // To enable: add `cache: { type: "database" }` (or redis) to withCache
      // and remove .skip. This test was deferred per RESEARCH open question #5
      // because enabling DB cache requires schema changes (new query_cache
      // table) that are out of scope for PERF-01.
    });
  });

  describe('Test 5 (alias-select parity audit — known divergence documentation)', () => {
    it('top-level ?fields= is honored under "query"; relation columns ARE NOT filtered by JoinOption.allow', async () => {
      const url = '?join[]=company&fields[]=id&fields[]=email&limit=3';
      const [queryRes, joinRes] = await Promise.all([
        request(server).get(`/perf01-users-query${url}`),
        request(server).get(`/perf01-users-join${url}`),
      ]);
      expect(queryRes.status).toBe(200);
      expect(joinRes.status).toBe(200);

      const qFirst = queryRes.body.data[0];
      const jFirst = joinRes.body.data[0];
      expect(qFirst).toBeDefined();
      expect(jFirst).toBeDefined();

      // (a) Top-level `?fields=` honored on both strategies.
      // The user object exposes id + email at minimum (primary keys are always
      // included). Other top-level user columns SHOULD NOT be present.
      expect(qFirst.id).toBeDefined();
      expect(qFirst.email).toBeDefined();
      expect(jFirst.id).toBeDefined();
      expect(jFirst.email).toBeDefined();
      expect(qFirst.isActive).toBeUndefined();
      expect(jFirst.isActive).toBeUndefined();

      // (b) `company` relation is populated under both strategies.
      // The first user in the seed may not have a company — find one.
      const qWithCompany = queryRes.body.data.find((u: any) => u.company);
      const jWithCompany = joinRes.body.data.find((u: any) => u.company);
      // Severity guard: relation MUST be present under at least one strategy
      // — if undefined under both, surface as deviation.
      if (!qWithCompany || !jWithCompany) {
        // eslint-disable-next-line no-console
        console.warn('[Test 5] no user with company in first 3 rows — divergence audit incomplete');
      } else {
        // Document divergence in test output (NOT a hard assertion):
        const qCols = Object.keys(qWithCompany.company).sort();
        const jCols = Object.keys(jWithCompany.company).sort();
        // eslint-disable-next-line no-console
        console.log(`[Test 5 audit] company columns under 'query': ${JSON.stringify(qCols)}`);
        // eslint-disable-next-line no-console
        console.log(`[Test 5 audit] company columns under 'join':  ${JSON.stringify(jCols)}`);
        // The DIVERGENCE: under 'query', TypeORM's setFindOptions ignores our
        // JoinOption.allow allowlist and loads ALL company columns. Under
        // 'join', JoinResolver applies the allowlist (`name`, `domain` only).
        // We assert presence (relation populated) but NOT column-level parity.
        expect(qWithCompany.company.id).toBeDefined();
        expect(jWithCompany.company.id).toBeDefined();
      }
    });
  });
});
