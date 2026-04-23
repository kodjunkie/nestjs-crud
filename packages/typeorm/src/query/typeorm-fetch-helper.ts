import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

export interface TypeOrmFetchHelperConfig {
  onNotFound: (alias: string) => void;
}

/**
 * Adapter-internal `FetchHelper<SelectQueryBuilder<T>>` implementation.
 *
 * Executes prepared `SelectQueryBuilder` state. `Q` (not `W`) is the
 * input type — the caller is responsible for composing the query first
 * (via `TypeOrmQueryComposer.applyToQuery` or equivalent).
 *
 * @internal — subject to change without semver-major.
 * @since 2.0.0
 */
export class TypeOrmFetchHelper<T extends ObjectLiteral> implements FetchHelper<SelectQueryBuilder<T>> {
  private readonly onNotFound: (alias: string) => void;

  constructor(config: TypeOrmFetchHelperConfig) {
    this.onNotFound = config.onNotFound;
  }

  public count(qb: SelectQueryBuilder<T>): Promise<number> {
    return qb.getCount();
  }

  public async findOneOrFail<R = T>(qb: SelectQueryBuilder<T>, opts: FetchHelperFindOneOpts): Promise<R> {
    const { withDeleted = false, onNotFound } = opts;
    const found = withDeleted ? await qb.withDeleted().getOne() : await qb.getOne();

    if (!found) {
      const notify = onNotFound ?? this.onNotFound;
      notify(qb.alias);
    }

    return found as unknown as R;
  }

  public async executeMany<R = T>(
    qb: SelectQueryBuilder<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parsed: import('@nestjs-crud/request').ParsedRequestParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: import('@nestjs-crud/core').CrudRequestOptions,
  ): Promise<R[]> {
    // Reserved for future parity. The TypeOrmCrudService currently
    // owns `doGetMany` (pagination-aware). Keeping this method declared so
    // `FetchHelper<Q>` is fully implemented; not yet wired into the facade.
    return (await qb.getMany()) as unknown as R[];
  }
}
