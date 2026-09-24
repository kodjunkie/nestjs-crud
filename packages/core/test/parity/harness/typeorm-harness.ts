/**
 * TypeORM parity harness for the cross-adapter parity suite.
 *
 * Uses better-sqlite3 DataSource with a minimal entity. Builds a
 * TypeOrmQueryComposer with a throwing `onBadRequest` stub.
 *
 * Exports `buildTypeOrmComposer()` — the factory used by query-composer-parity.spec.ts.
 */
import { BadRequestException } from '@nestjs/common';
import { JoinResolver, type JoinOptions } from '@nestjs-crud/core';
import type { QueryJoin } from '@nestjs-crud/request';
import {
  Brackets,
  Column,
  DataSource,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';

import { TypeOrmJoinResolver } from '@nestjs-crud/typeorm/typeorm-join-resolver';
import { TypeOrmQueryComposer } from '@nestjs-crud/typeorm/query/typeorm-query-composer';
import { TypeOrmWhereBuilder } from '@nestjs-crud/typeorm/query/typeorm-where-builder';
import { REFERENCE_DATASET } from '../scondition-matrix';

// ---------------------------------------------------------------------------
// Minimal TypeORM entity that mirrors RefUser for in-memory SQLite
// ---------------------------------------------------------------------------

@Entity('parity_user')
class ParityUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 100 })
  nameFirst!: string;

  @Column({ type: 'varchar', length: 100 })
  nameLast!: string;

  @Column({ type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ type: 'int' })
  companyId!: number;

  @Column({ type: 'int', nullable: true })
  profileId!: number | null;

  @Column({ type: 'int' })
  age!: number;
}

// ---------------------------------------------------------------------------
// Orphan-nested-join guard fixture: user -> profile -> licenses
// ---------------------------------------------------------------------------

@Entity('parity_guard_profile')
class ParityGuardProfile {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToMany(() => ParityGuardLicense, (license) => license.profile)
  licenses!: ParityGuardLicense[];
}

@Entity('parity_guard_license')
class ParityGuardLicense {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @ManyToOne(() => ParityGuardProfile, (profile) => profile.licenses)
  @JoinColumn({ name: 'profileId' })
  profile!: ParityGuardProfile;

  @Column({ type: 'int', nullable: true })
  profileId!: number | null;
}

@Entity('parity_guard_user')
class ParityGuardUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => ParityGuardProfile)
  @JoinColumn({ name: 'profileId' })
  profile!: ParityGuardProfile;

  @Column({ type: 'int', nullable: true })
  profileId!: number | null;
}

// ---------------------------------------------------------------------------
// Singleton DataSource — initialized once across the test suite
// ---------------------------------------------------------------------------

let _dataSource: DataSource | null = null;

async function getDataSource(): Promise<DataSource> {
  if (_dataSource && _dataSource.isInitialized) return _dataSource;
  _dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [ParityUser, ParityGuardUser, ParityGuardProfile, ParityGuardLicense],
    synchronize: true,
    dropSchema: true,
  });
  await _dataSource.initialize();

  // Seed REFERENCE_DATASET
  const repo = _dataSource.getRepository(ParityUser);
  for (const u of REFERENCE_DATASET) {
    const entity = repo.create({
      id: u.id,
      email: u.email,
      nameFirst: u.nameFirst,
      nameLast: u.nameLast,
      isActive: u.isActive,
      companyId: u.companyId,
      profileId: u.profileId,
      age: u.age,
    });
    await repo.save(entity);
  }

  return _dataSource;
}

export async function teardownTypeOrmDataSource(): Promise<void> {
  if (_dataSource && _dataSource.isInitialized) {
    await _dataSource.destroy();
    _dataSource = null;
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

export interface TypeOrmHarness {
  /**
   * Apply parsed request + run query; returns array of IDs matching the predicate.
   *
   * The optional `routeQuery` carries a route-level `@Crud({ query: {...} })`
   * config (for example a default `sort`) into `composer.applyToQuery`'s
   * `options.query`, alongside the parsed request. Callers that pass only
   * `parsed` keep today's behavior (an empty route query).
   */
  applyAndRun(parsed: any, routeQuery?: Record<string, unknown>): Promise<number[]>;

  /**
   * Drive the real `TypeOrmJoinResolver.applyJoins` guard against the
   * `ParityGuardUser` -> `profile` -> `licenses` fixture, then execute the
   * resulting query so a valid nested join proves it is runnable SQL, not
   * just an accepted call.
   */
  applyJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<void>;

  /**
   * Drive the same guard resolver against a fresh query builder and return
   * the sorted relation names actually joined, read from the built query's
   * `expressionMap.joinAttributes` aliases.
   */
  loadedJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function buildTypeOrmComposer(): Promise<TypeOrmHarness> {
  const ds = await getDataSource();
  const repo: Repository<ParityUser> = ds.getRepository(ParityUser);

  const entityColumnsHash: Record<string, string> = {
    id: 'id',
    email: 'email',
    nameFirst: 'nameFirst',
    nameLast: 'nameLast',
    isActive: 'isActive',
    companyId: 'companyId',
    profileId: 'profileId',
    age: 'age',
  };

  const joinResolver = new TypeOrmJoinResolver<ParityUser>(repo, {
    onBadRequest: throwingOnBadRequest,
  });

  const whereBuilder = new TypeOrmWhereBuilder<ParityUser>({
    repo,
    entityColumnsHash,
    onBadRequest: throwingOnBadRequest,
  });

  const composer = new TypeOrmQueryComposer<ParityUser>({
    repo,
    entityColumnsHash,
    entityHasDeleteColumn: false,
    onBadRequest: throwingOnBadRequest,
    joinResolver: joinResolver as unknown as JoinResolver<SelectQueryBuilder<ParityUser>>,
    whereBuilder: whereBuilder as unknown as { build: (search: any) => Brackets } as any,
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

      const qb = repo.createQueryBuilder('ParityUser');
      const composed = composer.applyToQuery(qb, normalized, {
        ...emptyOptions,
        query: { ...(routeQuery ?? {}) },
      });
      const rows = await composed.getMany();
      return rows.map((r: ParityUser) => r.id);
    },

    async applyJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<void> {
      const guardRepo = ds.getRepository(ParityGuardUser);
      const guardResolver = new TypeOrmJoinResolver<ParityGuardUser>(guardRepo, {
        onBadRequest: throwingOnBadRequest,
      });
      const qb = guardResolver.applyJoins(guardRepo.createQueryBuilder('ParityGuardUser'), joins, joinOptions);
      await qb.getMany();
    },

    async loadedJoins(joins: QueryJoin[], joinOptions: JoinOptions): Promise<string[]> {
      const guardRepo = ds.getRepository(ParityGuardUser);
      const guardResolver = new TypeOrmJoinResolver<ParityGuardUser>(guardRepo, {
        onBadRequest: throwingOnBadRequest,
      });
      const qb = guardResolver.applyJoins(guardRepo.createQueryBuilder('ParityGuardUser'), joins, joinOptions);
      const aliases = qb.expressionMap.joinAttributes.map((j) => j.alias.name);
      return Array.from(new Set(aliases)).sort();
    },
  };
}
