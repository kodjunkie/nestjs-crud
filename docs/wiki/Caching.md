# Caching

`@nestjs-crud` exposes per-controller caching through the `@Crud({ query: { cache: <ttl-ms> } })` option. This page documents how to wire each adapter's cache backend correctly and how the new `CrudCacheNotConfiguredError` (v2.0.0) helps catch misconfiguration early.

## TypeORM (full support)

The TypeORM adapter forwards `@Crud({ query: { cache } })` to TypeORM's native `query.cache(ttl)` API. For this to work, your `DataSource` MUST be configured with a `cache` provider — otherwise the request fails fast with `CrudCacheNotConfiguredError` (see below).

### Option 1: Redis (recommended for production)

```ts
new DataSource({
  type: 'postgres',
  // ... connection options
  cache: {
    type: 'redis',
    options: { host: 'localhost', port: 6379 },
    duration: 30000, // default TTL when @Crud cache option is `true` instead of a number
  },
});
```

Redis is the recommended production choice because the cache is shared across worker processes and survives application restarts.

### Option 2: Database table

```ts
new DataSource({
  // ...
  cache: { type: 'database' },
});
```

TypeORM creates a `query-result-cache` table on first run. Useful when you don't want a separate Redis dependency, but inherits the latency and contention characteristics of the underlying database.

### Option 3: In-memory

```ts
new DataSource({
  // ...
  cache: true, // shorthand for in-memory
});
```

Not recommended for production — cache is lost on process restart and is not shared between workers (each process has its own copy, defeating the point of caching for horizontally scaled deployments).

### Per-controller usage

```ts
@Crud({
  model: { type: User },
  query: { cache: 5000 }, // 5-second TTL
})
@Controller('users')
export class UsersController { /* ... */ }
```

The TTL value is forwarded to TypeORM's `SelectQueryBuilder.cache(milliseconds)` call when the controller's read endpoints (`getManyBase`, `getOneBase`) execute.

### Per-request opt-out

Consumers can disable caching for a specific request by passing `?cache=0` in the query string — useful for cache-busting after writes, or for admin tooling that needs fresh reads.

```
GET /users?cache=0
```

### Fail-fast on misconfiguration (v2.0.0)

If you set `@Crud({ query: { cache } })` but forgot to configure `DataSource({ cache: ... })`, requests now fail with:

```
CrudCacheNotConfiguredError: @Crud cache option requires a DataSource cache provider. Configure DataSource({ cache: { type: 'redis', ... } }) or remove the cache option from your @Crud() configuration.
```

This is a deliberate plain `Error` subclass (not a NestJS `HttpException`) because cache misconfiguration is a developer / deployment error surfaced at first-cached-query time — it should fail loud so the operator fixes the config rather than being silently rendered as a generic 500 response.

**To fix:** either configure your `DataSource` with one of the three options above, or remove the `cache` field from your `@Crud()` decorator.

## Drizzle, MikroORM, Prisma (consumer-owned)

These adapters do NOT currently honor the `@Crud({ query: { cache } })` option. Caching for these ORMs is best handled at the application layer using each ORM's own caching primitives:

- **Drizzle:** No first-party query cache as of v0.45.x. Use a Redis-backed wrapper at the service layer or an HTTP-cache layer above the controller. See the [Drizzle docs](https://orm.drizzle.team/docs/overview).
- **MikroORM:** Use [MikroORM's Result Cache](https://mikro-orm.io/docs/caching) — `em.find(User, ..., { cache: 30000 })`. Apply at your service layer above `@nestjs-crud/mikro-orm`.
- **Prisma:** Use [Prisma Accelerate](https://www.prisma.io/docs/accelerate) for managed caching, or a Redis-backed memoization wrapper. Prisma has no first-party in-process query cache.

Setting `@Crud({ query: { cache } })` on a controller backed by Drizzle / MikroORM / Prisma is currently a no-op. A unified caching API across all four adapters is tracked as a Phase 12+ deferred idea.

## See also

- `CrudCacheNotConfiguredError` source: [packages/core/src/exceptions/crud-cache-not-configured.error.ts](https://github.com/kodjunkie/nestjs-crud/blob/master/packages/core/src/exceptions/crud-cache-not-configured.error.ts)
- TypeORM caching docs: https://typeorm.io/caching
- [@nestjs-crud/typeorm README](https://github.com/kodjunkie/nestjs-crud/blob/master/packages/typeorm/README.md)
