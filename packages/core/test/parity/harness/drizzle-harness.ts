/**
 * Drizzle parity harness for the cross-adapter parity suite.
 *
 * Uses better-sqlite3 + drizzle-orm/better-sqlite3 with a sqliteTable schema.
 * Builds a DrizzleQueryComposer with a throwing `onBadRequest` stub.
 *
 * Exports `buildDrizzleComposer()` — the factory used by query-composer-parity.spec.ts.
 */
import { BadRequestException } from '@nestjs/common';
import type { JoinOptions } from '@nestjs-crud/core';
import type { QueryJoin } from '@nestjs-crud/request';

const Database = require('better-sqlite3');
import { getTableColumns } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { DrizzleJoinResolver } from '@nestjs-crud/drizzle/drizzle-join-resolver';
import { DrizzleQueryComposer } from '@nestjs-crud/drizzle/query/drizzle-query-composer';
import { DrizzleWhereBuilder } from '@nestjs-crud/drizzle/query/drizzle-where-builder';
import { REFERENCE_DATASET } from '../scondition-matrix';

// ---------------------------------------------------------------------------
// sqliteTable schema matching RefUser
// ---------------------------------------------------------------------------

const parityUsers = sqliteTable('parity_user', {
  id: integer('id').primaryKey(),
  email: text('email').notNull(),
  nameFirst: text('name_first').notNull(),
  nameLast: text('name_last').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull(),
  companyId: integer('company_id').notNull(),
  profileId: integer('profile_id'),
  age: integer('age').notNull(),
});

// ---------------------------------------------------------------------------
// Orphan-nested-join guard fixture: user -> profile -> licenses
// ---------------------------------------------------------------------------

const guardUsers = sqliteTable('parity_guard_user', {
  id: integer('id').primaryKey(),
  profileId: integer('profile_id'),
});

const guardProfiles = sqliteTable('parity_guard_profile', {
  id: integer('id').primaryKey(),
});

const guardLicenses = sqliteTable('parity_guard_license', {
  id: integer('id').primaryKey(),
  code: text('code'),
  profileId: integer('profile_id'),
});

// ---------------------------------------------------------------------------
// Singleton DB — initialized once per test run
// ---------------------------------------------------------------------------

let _sqlite: any = null;
let _db: ReturnType<typeof drizzle> | null = null;
let _seeded = false;

function getDb(): { db: ReturnType<typeof drizzle>; sqlite: any } {
  if (_db && _sqlite) return { db: _db, sqlite: _sqlite };
  _sqlite = new Database(':memory:');
  _db = drizzle(_sqlite);
  return { db: _db, sqlite: _sqlite };
}

function seedIfNeeded(db: ReturnType<typeof drizzle>): void {
  if (_seeded) return;

  // Create table
  (_sqlite as any).exec(`
    CREATE TABLE IF NOT EXISTS parity_user (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      name_first TEXT NOT NULL,
      name_last TEXT NOT NULL,
      is_active INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      profile_id INTEGER,
      age INTEGER NOT NULL
    )
  `);

  (_sqlite as any).exec(`
    CREATE TABLE IF NOT EXISTS parity_guard_user (
      id INTEGER PRIMARY KEY,
      profile_id INTEGER
    )
  `);
  (_sqlite as any).exec(`
    CREATE TABLE IF NOT EXISTS parity_guard_profile (
      id INTEGER PRIMARY KEY
    )
  `);
  (_sqlite as any).exec(`
    CREATE TABLE IF NOT EXISTS parity_guard_license (
      id INTEGER PRIMARY KEY,
      code TEXT,
      profile_id INTEGER
    )
  `);

  // Insert REFERENCE_DATASET
  for (const u of REFERENCE_DATASET) {
    db.insert(parityUsers)
      .values({
        id: u.id,
        email: u.email,
        nameFirst: u.nameFirst,
        nameLast: u.nameLast,
        isActive: u.isActive,
        companyId: u.companyId,
        profileId: u.profileId ?? null,
        age: u.age,
      })
      .run();
  }

  _seeded = true;
}

export function teardownDrizzleDb(): void {
  if (_sqlite) {
    _sqlite.close();
    _sqlite = null;
    _db = null;
    _seeded = false;
  }
}

// ---------------------------------------------------------------------------
// Throwing stub — NEVER jest.fn() on a security path
// ---------------------------------------------------------------------------

const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

// ---------------------------------------------------------------------------
// Harness shape
// ---------------------------------------------------------------------------

export interface DrizzleHarness {
  /**
   * The optional `routeQuery` carries a route-level `@Crud({ query: {...} })`
   * config (for example a default `sort`) into `composer.applyToQuery`'s
   * `options.query`, alongside the parsed request. Callers that pass only
   * `parsed` keep today's behavior (an empty route query).
   */
  applyAndRun(parsed: any, routeQuery?: Record<string, unknown>): Promise<number[]>;

  /**
   * Drive the real `DrizzleJoinResolver.applyJoins` guard against the
   * `parity_guard_user` -> `profile` -> `licenses` fixture, then execute
   * the resulting query so a valid nested join proves it is runnable SQL.
   */
  applyJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<void>;

  /**
   * Drive the same guard resolver against a small recording object exposing
   * `leftJoin`/`innerJoin` (records the joined table, returns itself), then
   * maps the recorded tables back to their relation names.
   */
  loadedJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function buildDrizzleComposer(): DrizzleHarness {
  const { db } = getDb();
  seedIfNeeded(db);

  const columnsMap = getTableColumns(parityUsers) as any;

  const joinResolver = new DrizzleJoinResolver({
    relationsConfig: {},
    onBadRequest: throwingOnBadRequest,
  });

  const whereBuilder = new DrizzleWhereBuilder({
    columnsMap,
    dbDialect: 'sqlite',
    onBadRequest: throwingOnBadRequest,
  });

  const composer = new DrizzleQueryComposer({
    db,
    table: parityUsers,
    entityColumns: Object.keys(columnsMap),
    entityPrimaryColumns: ['id'],
    columnsMap,
    entityHasDeleteColumn: false,
    softDeleteColumn: null,
    onBadRequest: throwingOnBadRequest,
    joinResolver,
    whereBuilder,
  });

  const emptyOptions = { query: {}, routes: {}, params: {} } as any;

  return {
    async applyAndRun(parsed: any, routeQuery?: Record<string, unknown>): Promise<number[]> {
      const normalized = {
        fields: [],
        paramsFilter: [],
        authPersist: undefined,
        classTransformOptions: undefined,
        search: {},
        filter: [],
        or: [],
        join: [],
        sort: [],
        limit: undefined,
        offset: undefined,
        page: undefined,
        cache: undefined,
        includeDeleted: 0,
        ...parsed,
      };

      const query = composer.newQuery();
      const composed = composer.applyToQuery(query, normalized, {
        ...emptyOptions,
        query: { ...(routeQuery ?? {}) },
      });
      const rows = await composed;
      return (rows as any[]).map((r: any) => r.id);
    },

    async applyJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<void> {
      const guardResolver = new DrizzleJoinResolver({
        relationsConfig: {
          profile: { table: guardProfiles, foreignKey: guardProfiles.id, referenceKey: guardUsers.profileId },
          'profile.licenses': {
            table: guardLicenses,
            foreignKey: guardLicenses.profileId,
            referenceKey: guardProfiles.id,
          },
        },
        onBadRequest: throwingOnBadRequest,
      });
      const query = guardResolver.applyJoins(db.select().from(guardUsers), joins, joinOptions);
      await (query as any).all();
    },

    async loadedJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<string[]> {
      const guardResolver = new DrizzleJoinResolver({
        relationsConfig: {
          profile: { table: guardProfiles, foreignKey: guardProfiles.id, referenceKey: guardUsers.profileId },
          'profile.licenses': {
            table: guardLicenses,
            foreignKey: guardLicenses.profileId,
            referenceKey: guardProfiles.id,
          },
        },
        onBadRequest: throwingOnBadRequest,
      });

      const recordedTables: any[] = [];
      const recording: any = {
        leftJoin: (table: any) => {
          recordedTables.push(table);
          return recording;
        },
        innerJoin: (table: any) => {
          recordedTables.push(table);
          return recording;
        },
      };

      guardResolver.applyJoins(recording, joins, joinOptions);

      const tableToName = new Map<any, string>([
        [guardProfiles, 'profile'],
        [guardLicenses, 'licenses'],
      ]);

      const names = recordedTables.map((table) => tableToName.get(table)).filter((name): name is string => !!name);
      return Array.from(new Set(names)).sort();
    },
  };
}
