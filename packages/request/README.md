<div align="center">
  <h1>@nestjs-crud/request</h1>
</div>
<div align="center">
  <strong>Frontend query builder + backend query parser for @nestjs-crud</strong>
</div>

## Install

Requires Node.js 22.12.0 or later. This package depends only on `@nestjs-crud/util` and `qs` and would run on older releases; the floor is uniform across every `@nestjs-crud` package so a consumer installing any of them gets one Node requirement rather than several. The packages that integrate with NestJS set the floor: NestJS 12 ships as ESM only, and they are CommonJS, so they load it through Node's `require()`-of-ESM support, which lands at 22.12.0.

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
