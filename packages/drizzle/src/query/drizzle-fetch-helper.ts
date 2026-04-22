import type { FetchHelper, FetchHelperFindOneOpts } from '@nestjs-crud/core/query';
import type { CrudRequestOptions } from '@nestjs-crud/core';
import type { ParsedRequestParams } from '@nestjs-crud/request';

// TYPES-01 debt: Drizzle's $dynamic select-builder type surface is unstable.
type AnyDrizzleSelect = any;

export interface DrizzleFetchHelperConfig {
  onNotFound: (alias: string) => void;
}

/**
 * Adapter-internal `FetchHelper<AnyDrizzleSelect>` implementation.
 *
 * Executes prepared Drizzle `$dynamic()` builder state. Per D-07, `Q` (not
 * `W`) is the input type — the caller is responsible for composing the query
 * first (via `DrizzleQueryComposer.applyToQuery` or equivalent).
 *
 * @internal — subject to change without semver-major (D-03 / §api-versioning).
 * @since 2.0.0
 */
export class DrizzleFetchHelper implements FetchHelper<AnyDrizzleSelect> {
  private readonly onNotFound: (alias: string) => void;

  constructor(config: DrizzleFetchHelperConfig) {
    this.onNotFound = config.onNotFound;
  }

  public async count(qb: AnyDrizzleSelect): Promise<number> {
    const result = await qb;
    return Number(result[0]?.count ?? 0);
  }

  public async findOneOrFail<R = unknown>(qb: AnyDrizzleSelect, opts: FetchHelperFindOneOpts): Promise<R> {
    const { onNotFound } = opts;
    qb.limit(1);
    const results = (await qb) as any[];
    const found = results[0];

    if (!found) {
      const notify = onNotFound ?? this.onNotFound;
      notify('');
    }

    return found as unknown as R;
  }

  public async executeMany<R = unknown>(
    qb: AnyDrizzleSelect,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _parsed: ParsedRequestParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: CrudRequestOptions,
  ): Promise<R[]> {
    // Reserved for future parity (Phase 7). The DrizzleCrudService currently
    // owns `getMany` (pagination-aware). Keeping this method declared so
    // `FetchHelper<Q>` is fully implemented; not yet wired into the facade.
    return (await qb) as unknown as R[];
  }
}
