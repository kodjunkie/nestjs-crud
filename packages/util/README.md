<div align="center">
  <h1>@nestjs-crud/util</h1>
</div>
<div align="center">
  <strong>Type-check utilities for the @nestjs-crud monorepo</strong>
</div>

## Install

Requires Node.js 22.12.0 or later — NestJS 12 ships as ESM only, and this package is CommonJS; it loads NestJS 12 through Node's `require(esm)` support, which arrives at 22.12.0.

```shell
npm i @nestjs-crud/util
```

## Usage

`@nestjs-crud/util` provides tiny type-guard utilities (`isNil`, `isArrayFull`, `isObject`, etc.) used across the other `@nestjs-crud/*` packages. Most consumers will never import this directly — it's pulled in transitively by `@nestjs-crud/core` and the adapter packages.

```typescript
import { isNil, isArrayFull } from '@nestjs-crud/util';

if (!isNil(value)) {
  // value is non-null and non-undefined
}

if (isArrayFull(items)) {
  // items is an array with at least one element
}
```

## See also

- [@nestjs-crud/core](https://www.npmjs.com/package/@nestjs-crud/core) — the framework that consumes these utilities
- [Project README](https://github.com/kodjunkie/nestjs-crud) and [Wiki](https://github.com/kodjunkie/nestjs-crud/wiki)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
