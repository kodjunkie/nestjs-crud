import type { ParsedRequestParams, QuerySort } from '@nestjs-crud/request';

import type { CursorPayload } from '../cursor/cursor-payload.interface';
import type { CrudRequestOptions } from '../interfaces/crud-options.interface';

/**
 * Applies WHERE + sort + pagination + field selection + soft-delete + eager joins to Q.
 * OWNS the SQLi invariant (dotted-path sort allowlist via JoinResolver).
 *
 * @internal — implementation detail of @nestjs-crud adapters.
 * Subject to change without a semver-major bump. Not exported from the main
 * `@nestjs-crud/core` barrel; accessed via `@nestjs-crud/core/query` deep path.
 */
export interface QueryComposer<Q> {
  applyToQuery(qb: Q, parsed: ParsedRequestParams, options: CrudRequestOptions): Q;

  /**
   * Apply keyset cursor WHERE + ORDER BY (with PK tie-breaker) on top of the
   * already-composed query. Skipped silently when `decoded` is null (first page).
   *
   * SQLi invariant: `sort.field` MUST be validated through the same allowlist
   * as `mapSort()` before any identifier reaches the ORM's ORDER BY surface.
   *
   * @since 2.2.0
   */
  applyCursor(qb: Q, decoded: CursorPayload | null, sort: QuerySort): Q;
}
