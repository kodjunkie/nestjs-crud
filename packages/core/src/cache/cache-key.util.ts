import { createHash } from 'crypto';
import type { ParsedRequestParams } from '@nestjs-crud/request';

/**
 * Deterministic JSON stringify with sorted object keys. Preserves array order
 * (semantic — `$and: [a, b]` differs from `$and: [b, a]`). Primitives stringify
 * via `JSON.stringify` directly. `undefined` is preserved by callers via
 * `?? null` guards before passing in.
 */
function sortedStringify(o: unknown): string {
  if (typeof o !== 'object' || o === null) return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(sortedStringify).join(',') + ']';
  return (
    '{' +
    Object.keys(o as object)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + sortedStringify((o as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

/**
 * Compute a stable cache key for a parsed request against a named entity.
 *
 * Key = `<entityName>:<sha1-16hex>` of the canonical JSON of the request's
 * cacheable inputs (filter / search / join / sort / select / limit / offset /
 * page / authPersist). Same logical inputs ⇒ same key, regardless of JS object
 * key insertion order. Different `authPersist` ⇒ different key (multi-tenant
 * isolation).
 *
 * SHA-1 is used as a NON-cryptographic fingerprint. 16 hex chars = 64 bits
 * of collision space, sufficient for cache-key uniqueness within entity scope.
 *
 * @since 2.2.0
 */
export function buildCacheKey(entityName: string, parsed: ParsedRequestParams): string {
  const payload = {
    entityName,
    filter: parsed.filter,
    search: parsed.search,
    join: parsed.join,
    sort: parsed.sort,
    fields: parsed.fields,
    limit: parsed.limit,
    offset: parsed.offset,
    page: parsed.page,
    authPersist: parsed.authPersist ?? null,
  };
  const canonical = sortedStringify(payload);
  const hash = createHash('sha1').update(canonical).digest('hex').slice(0, 16);
  return `${entityName}:${hash}`;
}
