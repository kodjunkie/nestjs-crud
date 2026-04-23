import type { ParsedRequestParams } from '@nestjs-crud/request';

import type { CrudRequestOptions } from '../interfaces/crud-options.interface';
import type { GetManyDefaultResponse } from '../interfaces/get-many-default-response.interface';

export interface FetchHelperFindOneOpts {
  shallow?: boolean;
  withDeleted?: boolean;
  onNotFound?: (alias: string) => void;
}

/**
 * Executes prepared queries. Method signatures take Q (not W) because
 * Drizzle's two-query dance needs already-prepared query state.
 *
 * @internal — implementation detail of @nestjs-crud adapters.
 * Subject to change without a semver-major bump. Not exported from the main
 * `@nestjs-crud/core` barrel; accessed via `@nestjs-crud/core/query` deep path.
 */
export interface FetchHelper<Q> {
  count(qb: Q): Promise<number>;
  findOneOrFail<T = unknown>(qb: Q, opts: FetchHelperFindOneOpts): Promise<T>;
  executeMany<T = unknown>(
    qb: Q,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<T[] | GetManyDefaultResponse<T>>;
}
