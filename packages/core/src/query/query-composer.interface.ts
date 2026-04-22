import type { ParsedRequestParams } from '@nestjs-crud/request';

import type { CrudRequestOptions } from '../interfaces/crud-options.interface';

/**
 * Applies WHERE + sort + pagination + field selection + soft-delete + eager joins to Q.
 * OWNS the D-05b SQLi invariant (dotted-path sort allowlist via JoinResolver).
 *
 * @internal — implementation detail of @nestjs-crud adapters.
 * Subject to change without a semver-major bump. Not exported from the main
 * `@nestjs-crud/core` barrel; accessed via `@nestjs-crud/core/query` deep path.
 */
export interface QueryComposer<Q> {
  applyToQuery(qb: Q, parsed: ParsedRequestParams, options: CrudRequestOptions): Q;
}
