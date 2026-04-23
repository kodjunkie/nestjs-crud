<div align="center">
  <h1>@nestjs-crud/util</h1>
</div>
<div align="center">
  <strong>Type-check utilities for the @nestjs-crud monorepo</strong>
</div>

## Install

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
