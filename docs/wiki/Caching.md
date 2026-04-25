# Caching

`@nestjs-crud` exposes per-controller caching through `@Crud({ query: { cache: <ttl-ms> } })`. The TypeORM adapter wires it through to TypeORM's own cache. Drizzle, MikroORM, and Prisma ignore the option; cache those at the ORM or service layer.

## TypeORM

The TypeORM adapter forwards `@Crud({ query: { cache } })` to TypeORM's native `query.cache(ttl)` API. Your `DataSource` must declare a `cache` provider, otherwise the first cached read throws `CrudCacheNotConfiguredError` (added in v2.0.0).

### Redis (recommended for production)

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

Cache stays shared across worker processes and survives restarts.

### Database table

```ts
new DataSource({
  // ...
  cache: { type: 'database' },
});
```

TypeORM creates a `query-result-cache` table on first run. No extra service to operate, but reads inherit the latency and contention of the underlying database.

### In-memory

```ts
new DataSource({
  // ...
  cache: true, // shorthand for in-memory
});
```

Skip this in production. Cache dies with the process and each worker keeps its own copy, which defeats the point under horizontal scaling.

### Per-controller usage

```ts
@Crud({
  model: { type: User },
  query: { cache: 5000 }, // 5-second TTL
})
@Controller('users')
export class UsersController { /* ... */ }
```

The TTL is forwarded to `SelectQueryBuilder.cache(milliseconds)` on `getManyBase` and `getOneBase`.

### Per-request opt-out

Pass `?cache=0` to bypass the cache for a single request. Useful right after writes, or for admin tools that need a fresh read.

```
GET /users?cache=0
```

### `CrudCacheNotConfiguredError`

If `@Crud({ query: { cache } })` is set but `DataSource({ cache })` is not, the next cached read throws:

```
CrudCacheNotConfiguredError: @Crud cache option requires a DataSource cache provider. Configure DataSource({ cache: { type: 'redis', ... } }) or remove the cache option from your @Crud() configuration.
```

It is a plain `Error` subclass, not an `HttpException`, so the full message lands in your logs instead of being shaped into a generic 500 response by Nest's HTTP filter. Cache misconfiguration is a deployment bug; surfacing it loudly is the point.

To fix: configure `DataSource({ cache })` using one of the three options above, or remove `cache` from `@Crud()`.

## Drizzle, MikroORM, Prisma

These adapters ignore `@Crud({ query: { cache } })`. Setting it is silent: no error, no cache. Reach for the ORM's own primitives instead.

- **Drizzle** has no first-party query cache as of v0.45.x. Common patterns are a Redis-backed memoizer at the service layer or an HTTP cache in front of the controller. See the [Drizzle docs](https://orm.drizzle.team/docs/overview).
- **MikroORM** ships a [Result Cache](https://mikro-orm.io/docs/caching) you can call from a service wrapping `@nestjs-crud/mikro-orm`: `em.find(User, ..., { cache: 30000 })`.
- **Prisma** has no in-process query cache. [Prisma Accelerate](https://www.prisma.io/docs/accelerate) is the managed option; otherwise a Redis memoizer wrapping the query works.

## See also

- `CrudCacheNotConfiguredError` source: [packages/core/src/exceptions/crud-cache-not-configured.error.ts](https://github.com/kodjunkie/nestjs-crud/blob/master/packages/core/src/exceptions/crud-cache-not-configured.error.ts)
- TypeORM caching docs: https://typeorm.io/caching
- [@nestjs-crud/typeorm README](https://github.com/kodjunkie/nestjs-crud/blob/master/packages/typeorm/README.md)
