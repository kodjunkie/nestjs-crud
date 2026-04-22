import { CrudRequestOptions, JoinResolver, QueryTranslator } from '@nestjs-crud/core';
import { ParsedRequestParams, SCondition } from '@nestjs-crud/request';
import { Brackets, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmFetchHelper } from './query/typeorm-fetch-helper';
import { TypeOrmQueryComposer } from './query/typeorm-query-composer';
import { TypeOrmWhereBuilder } from './query/typeorm-where-builder';

/**
 * Default no-op `onNotFound` thunk wired into `TypeOrmFetchHelper` when the
 * caller does not override via `findOneOrFail` hooks. Hoisted to module-scope
 * so it can be unit-tested directly (closes COVERAGE-01 D-17 sweep target).
 *
 * @internal
 */
export const defaultOnNotFound = (): undefined => undefined;

export interface TypeOrmQueryTranslatorConfig<T extends ObjectLiteral> {
  entityColumnsHash: ObjectLiteral;
  entityHasDeleteColumn: boolean;
  onBadRequest: (msg: string) => void;
  joinResolver: JoinResolver<SelectQueryBuilder<T>>;
}

/**
 * Facade translator composing 3 internal pieces (`TypeOrmWhereBuilder`,
 * `TypeOrmQueryComposer`, `TypeOrmFetchHelper`) behind the stable
 * `QueryTranslator<SelectQueryBuilder<T>, Brackets>` contract. Public 5-method
 * API is byte-identical to the monolithic pre-6.2 implementation.
 *
 * @since 2.0.0
 */
export class TypeOrmQueryTranslator<T extends ObjectLiteral> implements QueryTranslator<
  SelectQueryBuilder<T>,
  Brackets
> {
  private readonly repo: Repository<T>;

  private readonly whereBuilder: TypeOrmWhereBuilder<T>;

  private readonly queryComposer: TypeOrmQueryComposer<T>;

  private readonly fetchHelper: TypeOrmFetchHelper<T>;

  constructor(repo: Repository<T>, config: TypeOrmQueryTranslatorConfig<T>) {
    this.repo = repo;
    this.whereBuilder = new TypeOrmWhereBuilder<T>({
      repo,
      entityColumnsHash: config.entityColumnsHash,
      onBadRequest: config.onBadRequest,
    });
    this.queryComposer = new TypeOrmQueryComposer<T>({
      repo,
      entityColumnsHash: config.entityColumnsHash,
      entityHasDeleteColumn: config.entityHasDeleteColumn,
      onBadRequest: config.onBadRequest,
      joinResolver: config.joinResolver,
      whereBuilder: this.whereBuilder,
    });
    this.fetchHelper = new TypeOrmFetchHelper<T>({
      onNotFound: defaultOnNotFound,
    });
  }

  public buildWhere(search: SCondition): Brackets | undefined {
    return this.whereBuilder.build(search);
  }

  public applyToQuery(
    query: SelectQueryBuilder<T>,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): SelectQueryBuilder<T> {
    return this.queryComposer.applyToQuery(query, parsed, options);
  }

  public newQuery(select?: string[]): SelectQueryBuilder<T> {
    const qb = this.repo.createQueryBuilder(this.alias);
    if (select && select.length) qb.select(select);
    return qb;
  }

  public count(query: SelectQueryBuilder<T>): Promise<number> {
    return this.fetchHelper.count(query);
  }

  public async findOneOrFail(
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
    hooks: { shallow?: boolean; withDeleted?: boolean; onNotFound: () => void; repo?: Repository<T> },
  ): Promise<T> {
    const { shallow = false, withDeleted = false, onNotFound, repo = this.repo } = hooks;
    const alias = repo.metadata.targetName;
    const builder = shallow
      ? repo.createQueryBuilder(alias)
      : this.queryComposer.applyToQuery(repo.createQueryBuilder(alias), parsed, options);

    if (shallow) {
      const where = this.whereBuilder.build(parsed.search);
      if (where) builder.andWhere(where);
    }

    return this.fetchHelper.findOneOrFail<T>(builder, { withDeleted, onNotFound: () => onNotFound() });
  }

  private get alias(): string {
    return this.repo.metadata.targetName;
  }
}
