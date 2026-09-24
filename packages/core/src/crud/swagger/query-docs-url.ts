/**
 * The `swagger.queryDocsUrl` option: target of the query-syntax link appended
 * to the `getManyBase` and `getOneBase` OpenAPI descriptions, or `false` to
 * omit the line. Resolved route-level, then global, then this file's default.
 * No imports — kept dependency-free so both the factory and the config
 * service can validate a value before any other module state changes.
 */

/** The project's Query Syntax wiki page — the value when nothing is configured at any level. */
export const DEFAULT_QUERY_DOCS_URL = 'https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax';

/**
 * Builds the fixed-text link line appended to the getManyBase and getOneBase
 * descriptions. Only the URL varies; the surrounding text never changes.
 */
export function queryDocsLine(url: string): string {
  return `Full query syntax reference: [Query Syntax](${url}).`;
}

/**
 * `true` for `false` (the opt-out) and for a whitespace-free absolute
 * `http://`/`https://` URL with a non-empty hostname. `false` for everything
 * else, including `undefined` — callers treat an `undefined` value as
 * "not set" before ever calling this predicate.
 */
export function isValidQueryDocsUrl(value: unknown): value is string | false {
  if (value === false) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  if (value === '' || /\s/.test(value) || !/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Renders a `queryDocsUrl` value for an error message. */
export function describeQueryDocsUrlValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
