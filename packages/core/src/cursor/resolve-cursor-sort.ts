import type { QuerySort } from '@nestjs-crud/request';

/**
 * Structural view of a parsed request's sort array — the only shape
 * `resolveCursorSort` needs from `ParsedRequestParams`.
 *
 * @internal
 * @since 2.2.6
 */
export interface CursorSortSource {
  sort?: QuerySort[];
}

/**
 * Structural view of the route's `@Crud({ query })` sort option — the only
 * shape `resolveCursorSort` needs from `QueryOptions`.
 *
 * @internal
 * @since 2.2.6
 */
export interface CursorSortRouteOptions {
  sort?: QuerySort[];
}

/**
 * Outcome of resolving the effective cursor-mode sort field. Exactly one of
 * `sort` / `error` is non-null — the discriminated union lets callers narrow
 * on either field instead of relying on a comment.
 *
 * @internal
 * @since 2.2.6
 */
export type CursorSortResolution = { sort: QuerySort; error: null } | { sort: null; error: string };

/**
 * Resolve the effective single sort field for a cursor-mode `getMany`
 * request, mirroring the offset-mode composer's fallback chain: client
 * `?sort=` first, then the route's `@Crud({ query: { sort } })` default,
 * then neither.
 *
 * Performs no field-name validation and builds no SQL — the resolved field
 * still flows through each adapter's `applyCursor` allowlist check, exactly
 * the path client-supplied sort already takes.
 *
 * @internal
 * @since 2.2.6
 */
export function resolveCursorSort(
  parsed: CursorSortSource,
  routeQueryOptions?: CursorSortRouteOptions,
): CursorSortResolution {
  const clientSort = parsed.sort && parsed.sort.length ? parsed.sort : null;
  const routeSort =
    routeQueryOptions?.sort && routeQueryOptions.sort.length ? routeQueryOptions.sort : null;

  if (clientSort) {
    if (clientSort.length === 1) {
      return { sort: clientSort[0], error: null };
    }
    return {
      sort: null,
      error:
        'Cursor pagination supports a single sort field; ' +
        `the request query string supplied ${clientSort.length} fields: ` +
        `${clientSort.map((s) => s.field).join(', ')}`,
    };
  }

  if (routeSort) {
    if (routeSort.length === 1) {
      return { sort: routeSort[0], error: null };
    }
    return {
      sort: null,
      error:
        'Cursor pagination supports a single sort field; ' +
        `the route's @Crud({ query: { sort } }) default declares ${routeSort.length} fields: ` +
        `${routeSort.map((s) => s.field).join(', ')}`,
    };
  }

  return {
    sort: null,
    error:
      'Cursor pagination supports a single sort field; ' +
      'none was provided — pass ?sort=field,ASC in the request query string, ' +
      'or set @Crud({ query: { sort } }) on the route',
  };
}
