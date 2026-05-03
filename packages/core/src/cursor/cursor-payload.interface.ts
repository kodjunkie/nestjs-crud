/**
 * Cursor payload — the decoded shape of a cursor token.
 *
 * Encoded as base64url-encoded JSON via `CursorCodec.encode/decode`. Fields
 * carry the position state needed to resume keyset pagination on the next
 * request:
 * - sortField: the column the consumer is sorting by
 * - sortValue: the row's value for that column at the page boundary
 * - id: the row's primary-key value (PK tie-breaker for stable sort)
 * - dir: which direction this cursor advances ('next' walks forward,
 *   'prev' walks backward)
 *
 * Cursor is opaque to the consumer but NOT signed — authorization stays in
 * `@CrudAuth`, not in cursor opacity.
 *
 * @since 2.2.0
 */
export interface CursorPayload {
  sortField: string;
  sortValue: string | number | null;
  id: string | number;
  dir: 'next' | 'prev';
}
