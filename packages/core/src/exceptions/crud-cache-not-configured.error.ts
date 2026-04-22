/**
 * Thrown by adapter `QueryComposer` implementations when `@Crud({ query: { cache } })`
 * is set but the underlying ORM `DataSource` has no cache provider configured.
 *
 * This is a **deliberate plain `Error` subclass**, NOT a NestJS `HttpException`
 * (`error-throw-http-exceptions` polish lock-in). Cache misconfiguration is a
 * developer / deployment error surfaced at first-cached-query time — it should
 * fail loud so the operator fixes the config, not be rendered as a generic 500
 * by Nest's default exception filter.
 *
 * @see Phase 10 PERF-02 (D-06..D-09)
 * @since 2.0.0
 */
export class CrudCacheNotConfiguredError extends Error {
  constructor() {
    super(
      '@Crud cache option requires a DataSource cache provider. ' +
        "Configure DataSource({ cache: { type: 'redis', ... } }) " +
        'or remove the cache option from your @Crud() configuration.',
    );
    this.name = 'CrudCacheNotConfiguredError';
  }
}
