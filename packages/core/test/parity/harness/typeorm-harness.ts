/**
 * TypeORM parity harness for the cross-adapter parity suite.
 *
 * Uses better-sqlite3 DataSource with a minimal entity. Builds a
 * TypeOrmQueryComposer with a throwing `onBadRequest` stub (PATTERNS.md §5).
 *
 * Exports `buildTypeOrmComposer()` — the factory used by query-composer-parity.spec.ts.
 */
import { BadRequestException } from '@nestjs/common';
import { JoinResolver } from '@nestjs-crud/core';
import { Brackets, Column, DataSource, Entity, PrimaryGeneratedColumn, Repository, SelectQueryBuilder } from 'typeorm';

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
// Singleton DataSource — initialized once across the test suite
// ---------------------------------------------------------------------------

let _dataSource: DataSource | null = null;

async function getDataSource(): Promise<DataSource> {
  if (_dataSource && _dataSource.isInitialized) return _dataSource;
  _dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [ParityUser],
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
// Throwing stub — NEVER jest.fn() on a security path (PATTERNS.md §5)
// ---------------------------------------------------------------------------

const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

// ---------------------------------------------------------------------------
// Harness shape
// ---------------------------------------------------------------------------

export interface TypeOrmHarness {
  /** Apply parsed request + run query; returns array of IDs matching the predicate. */
  applyAndRun(parsed: any): Promise<number[]>;
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
    async applyAndRun(parsed: any): Promise<number[]> {
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
      const composed = composer.applyToQuery(qb, normalized, emptyOptions);
      const rows = await composed.getMany();
      return rows.map((r: ParityUser) => r.id);
    },
  };
}
