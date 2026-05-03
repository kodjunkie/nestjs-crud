/**
 * Thrown by adapter `FetchHelper` implementations when `@Crud({ query: { cache } })`
 * is set but no `CacheStrategy` is wired (via `CrudConfigService.load` or the
 * adapter's CrudService constructor) AND, for the TypeORM adapter, no
 * `DataSource.cache` provider is configured either.
 *
 * This is a **deliberate plain `Error` subclass**, NOT a NestJS `HttpException`
 * (`error-throw-http-exceptions` polish lock-in). Cache misconfiguration is a
 * developer / deployment error surfaced at first-cached-query time — it should
 * fail loud so the operator fixes the config, not be rendered as a generic 500
 * by Nest's default exception filter.
 *
 * @since 2.0.0
 */
export class CrudCacheNotConfiguredError extends Error {
  constructor() {
    super(
      '@Crud cache option requires a CacheStrategy. ' +
        'Configure via CrudConfigService.load({ query: { cacheStrategy } }) ' +
        'or pass a strategy to the CrudService constructor. ' +
        'For TypeORM, the legacy DataSource.cache provider is also accepted as a fallback.',
    );
    this.name = 'CrudCacheNotConfiguredError';
  }
}
