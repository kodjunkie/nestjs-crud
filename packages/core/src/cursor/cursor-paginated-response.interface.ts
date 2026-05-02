/**
 * Cursor-mode response shape from `getManyBase` when
 * `@Crud({ query: { pagination: 'cursor' } })` is set.
 *
 * Distinct from the offset-mode `GetManyDefaultResponse<T>` shape:
 * - Has `cursor: { next, prev }` carrying tokens for forward/back navigation
 * - Has NO `total / page / pageCount` keys (cursor mode skips the count query)
 *
 * Either token is `null` when there is no further page in that direction.
 *
 * @since 2.2.0
 */
export interface CursorPaginatedResponse<T> {
  data: T[];
  count: number;
  cursor: {
    next: string | null;
    prev: string | null;
  };
}
