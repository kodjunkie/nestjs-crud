<div align="center">
  <h1>@nestjs-crud/request</h1>
</div>
<div align="center">
  <strong>Frontend query builder + backend query parser for @nestjs-crud</strong>
</div>

## Install

Requires Node.js 22.12.0 or later — NestJS 12 ships as ESM only, and this package is CommonJS; it loads NestJS 12 through Node's `require(esm)` support, which arrives at 22.12.0.

```shell
npm i @nestjs-crud/request
```

## Usage

`@nestjs-crud/request` provides:

- **`RequestQueryBuilder`** — frontend helper to construct `?filter=`, `?sort=`, `?join=`, `?search=`, `?fields=`, `?limit=`, `?offset=` query strings.
- **`RequestQueryParser`** — backend helper to parse those query strings back into a structured `ParsedRequestParams` object the adapter services consume.

```typescript
import { RequestQueryBuilder } from '@nestjs-crud/request';

const qs = RequestQueryBuilder.create()
  .setFilter({ field: 'status', operator: 'eq', value: 'active' })
  .sortBy({ field: 'createdAt', order: 'DESC' })
  .setLimit(20)
  .query();

// qs === 'filter=status||$eq||active&sort=createdAt,DESC&limit=20'
fetch(`/api/users?${qs}`);
```

The parser side is wired automatically by `@nestjs-crud/core`'s `CrudRequestInterceptor` — most backend consumers don't need to call it directly.

## See also

- [Wiki: Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests) — full query-string syntax (search conditions, operators, joins, etc.)
- [@nestjs-crud/core](https://www.npmjs.com/package/@nestjs-crud/core) — consumes the parser
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
