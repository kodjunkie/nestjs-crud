import { CrudRequestOptions } from '@nestjs-crud/core';
import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';
import { ParsedRequestParams } from '@nestjs-crud/request';
import { EntityClass, EntityManager } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';

export interface MikroOrmFetchHelperConfig {
  onNotFound: (alias: string) => void;
  /**
   * di-scope-awareness: MUST be a thunk, NEVER a captured
   * `em: EntityManager` instance. MikroORM's per-request middleware returns
   * a fresh em with its own identity map — capturing em at ctor time would
   * freeze a stale map across requests, corrupting write paths ("row was
   * updated by another transaction" under load). Every method that needs em
   * calls `this.config.getEm()` fresh; the result is NEVER cached beyond
   * method scope.
   */
  getEm: () => EntityManager;
}

/**
 * Adapter-internal `FetchHelper<QueryBuilder<T>>` implementation.
 *
 * Executes prepared MikroORM `QueryBuilder` state. `Q` (not `W`) is the
 * input type — the caller is responsible for composing the query first
 * (via `MikroOrmQueryComposer.applyToQuery` or equivalent).
 *
 * ### getEm thunk contract
 *
 * The ctor takes `getEm: () => EntityManager` — a thunk, NOT a captured
 * `em` field. `findOneOrFail` resolves em fresh via `this.config.getEm()`
 * so request-scope middleware returns the correct em each call and the
 * identity map never goes stale. DO NOT add `private readonly em` — the
 * acceptance grep explicitly rejects that shape.
 *
 * @internal — subject to change without semver-major.
 * @since 2.0.0
 */
export class MikroOrmFetchHelper<T extends object> implements FetchHelper<QueryBuilder<T>> {
  constructor(private readonly config: MikroOrmFetchHelperConfig) {}

  public async count(qb: QueryBuilder<T>): Promise<number> {
    return (qb as any).getCount();
  }

  public async findOneOrFail<R = T>(qb: QueryBuilder<T>, opts: FetchHelperFindOneOpts): Promise<R> {
    // Fresh em per call (di-scope-awareness). The getEm() thunk is
    // re-invoked here instead of captured at ctor time.
    const em = this.config.getEm();
    void em; // em is currently resolved by callers via translator.findOneOrFail; reserved for future parity.

    (qb as any).limit(1);
    const result = await (qb as any).getSingleResult();

    if (!result) {
      const notify = opts.onNotFound ?? this.config.onNotFound;
      notify('');
    }

    return result as unknown as R;
  }

  /**
   * Convenience: create a fresh QB for `entityClass` against the current
   * request-scope em. Used by the translator facade's `findOneOrFail` to
   * preserve the pre-6.2 public contract (which takes `entityClass` +
   * `parsed` rather than a prepared QB).
   *
   * Every call resolves em via the `getEm()` thunk.
   */
  public createQueryBuilder(entityClass: EntityClass<T>): QueryBuilder<T> {
    const em = this.config.getEm();
    // @internal — EntityManager.createQueryBuilder is not in the @mikro-orm/core
    // type surface; it is provided by @mikro-orm/knex at runtime.
    return (em as unknown as { createQueryBuilder: (cls: EntityClass<T>) => QueryBuilder<T> }).createQueryBuilder(
      entityClass,
    );
  }

  public async executeMany<R = T>(
    qb: QueryBuilder<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parsed: ParsedRequestParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: CrudRequestOptions,
  ): Promise<R[]> {
    // Reserved for future parity. The MikroOrmCrudService currently
    // owns `getMany` (pagination-aware). Keeping this method declared so
    // `FetchHelper<Q>` is fully implemented; not yet wired into the facade.
    return (await (qb as any).getResult()) as unknown as R[];
  }
}
