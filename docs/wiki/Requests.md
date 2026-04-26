# Requests

## Description

`@nestjs-crud` parses path and query parameters to give you rich RESTful APIs without hand-rolling boilerplate. [`@nestjs-crud/request`](https://www.npmjs.com/package/@nestjs-crud/request) is the package that does the parsing and validating.

## Table of contents

- [Query params](#query-params)
  - [select](#select)
  - [search](#search)
  - [filter conditions](#filter-conditions)
  - [filter](#filter)
  - [or](#or)
  - [sort](#sort)
  - [join](#join)
  - [limit](#limit)
  - [offset](#offset)
  - [page](#page)
  - [cache](#cache)
- [Frontend usage](#frontend-usage)
  - [Customize](#customize)
  - [Usage](#usage)

## Query params

The default param names:

- `fields`, `select`: select which fields to return
- `s`: search conditions (`$and`, `$or`, all variations)
- `filter`: filter the GET result with `AND` conditions
- `or`: filter the GET result with `OR` conditions
- `join`: include joined relational resources in the GET result (all or selected fields)
- `sort`: sort the GET result by one or more fields, `ASC` or `DESC`
- `per_page`, `limit`: cap the number of returned resources
- `offset`: skip a number of resources before returning the slice
- `page`: return a page of `limit`-sized results
- `cache`: bypass cache (when caching is enabled) and read straight from the DB

You can rename any of these and pick different delimiters via [global options](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers#global-options).

Each param is described below using the default names.

### select

Selects fields to return in the response body.

_Syntax:_

> ?fields=**field1**,**field2**,...

_Example:_

> ?fields=**email**,**name**

### search

Adds a search condition as a JSON string. Combine `$and`, `$or`, and any [condition](#filter-conditions) you need. Send it URL-encoded, or use [`RequestQueryBuilder`](#frontend-usage) and let it encode for you.

_Syntax:_

> ?s={"name": "Michael"}

_Examples:_

- Search where `name` is either `null` OR equals `Superman`:

> ?s={"name": {"**\$or**": {"**\$isnull**": true, "**\$eq**": "Superman"}}}

- Search where `isActive` is `true` AND `createdAt` is not `2008-10-01T17:04:32`:

> ?s={"**\$and**": [{"isActive": true}, {"createdAt": {"**$ne**": "2008-10-01T17:04:32"}}]}

which is the same as:

> ?s={"isActive": true, "createdAt": {"**\$ne**": "2008-10-01T17:04:32"}}

- Search where `isActive` is `false` OR `updatedAt` is not `null`:

> ?s={"**\$or**": [{"isActive": false}, {"updatedAt": {"**$notnull**": true}}]}

The combinations compose freely.

> If `s` is present, [filter](#filter) and [or](#or) are ignored.

### filter conditions

- **`$eq`** (`=`, equal)
- **`$ne`** (`!=`, not equal)
- **`$gt`** (`>`, greater than)
- **`$lt`** (`<`, less than)
- **`$gte`** (`>=`, greater than or equal)
- **`$lte`** (`<=`, less than or equal)
- **`$starts`** (`LIKE val%`, starts with)
- **`$ends`** (`LIKE %val`, ends with)
- **`$cont`** (`LIKE %val%`, contains)
- **`$excl`** (`NOT LIKE %val%`, does not contain)
- **`$in`** (`IN`, in range, accepts multiple values)
- **`$notin`** (`NOT IN`, not in range, accepts multiple values)
- **`$isnull`** (`IS NULL`, no value accepted)
- **`$notnull`** (`IS NOT NULL`, no value accepted)
- **`$between`** (`BETWEEN`, accepts two values)
- **`$eqL`** (`LOWER(field) =`, equal)
- **`$neL`** (`LOWER(field) !=`, not equal)
- **`$startsL`** (`LIKE|ILIKE val%`)
- **`$endsL`** (`LIKE|ILIKE %val`)
- **`$contL`** (`LIKE|ILIKE %val%`)
- **`$exclL`** (`NOT LIKE|ILIKE %val%`)
- **`$inL`** (`LOWER(field) IN`, accepts multiple values)
- **`$notinL`** (`LOWER(field) NOT IN`, accepts multiple values)

### filter

Adds a field-level condition (or several) to the request.

_Syntax:_

> ?filter=**field**||**\$condition**||**value**

> ?join=**relation**&filter=**relation**.**field**||**\$condition**||**value**

> Nested filters require the relation to be joined first.

_Examples:_

> ?filter=**name**||**\$eq**||**batman**

> ?filter=**isVillain**||**\$eq**||**false**&filter=**city**||**\$eq**||**Arkham** (multiple filters AND-combine)

> ?filter=**shots**||**\$in**||**12**,**26** (some conditions accept comma-separated values)

> ?filter=**power**||**\$isnull** (some conditions take no value)

### or

Adds `OR` conditions, using the same [filter conditions](#filter-conditions).

_Syntax:_

> ?or=**field**||**\$condition**||**value**

_Rules and examples:_

- One `or` (without `filter`) behaves like a single [filter](#filter):

> ?or=**name**||**\$eq**||**batman**

- Multiple `or` (without `filter`) combine as `WHERE {or} OR {or} OR ...`:

> ?or=**name**||**\$eq**||**batman**&or=**name**||**\$eq**||**joker**

- One `or` plus one `filter` combines as `WHERE {filter} OR {or}`:

> ?filter=**name**||**\$eq**||**batman**&or=**name**||**\$eq**||**joker**

- Multiple of each: every `filter` AND-combines, every `or` AND-combines, then the two groups OR together:
  `WHERE ({filter} AND {filter} AND ...) OR ({or} AND {or} AND ...)`

> ?filter=**type**||**\$eq**||**hero**&filter=**status**||**\$eq**||**alive**&or=**type**||**\$eq**||**villain**&or=**status**||**\$eq**||**dead**

### sort

Sorts results by one or more fields.

_Syntax:_

> ?sort=**field**,**ASC|DESC**

_Examples:_

> ?sort=**name**,**ASC**

> ?sort=**name**,**ASC**&sort=**id**,**DESC**

### join

Includes joined relational objects in the GET result (all or selected fields). Join as many relations as your [CrudOptions](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers#join) allow.

_Syntax:_

> ?join=**relation**

> ?join=**relation**||**field1**,**field2**,...

> ?join=**relation1**||**field11**,**field12**,...&join=**relation1**.**nested**||**field21**,**field22**,...&join=...

_Examples:_

> ?join=**profile**

> ?join=**profile**||**firstName**,**email**

> ?join=**profile**||**firstName**,**email**&join=**notifications**||**content**&join=**tasks**

> ?join=**relation1**&join=**relation1**.**nested**&join=**relation1**.**nested**.**deepnested**

> The primary key column always persists in relational objects. For nested relations, the parent level must be joined before the child level (as in the example above).

### limit

Caps the number of returned entities.

_Syntax:_

> ?limit=**number**

_Example:_

> ?limit=**10**

### offset

Skips the first N resources before returning the slice. Combine with `limit` for offset pagination, and with `sort` for deterministic order.

_Syntax:_

> ?offset=**number**

_Example:_

> ?offset=**10**

### page

One-based page index. Combine with `limit` for predictable page sizes.

_Syntax:_

> ?page=**number**

_Example:_

> ?page=**2**

### cache

Bypass the cache (when caching is enabled) and read directly from the DB.

_Usage:_

> ?cache=0

## Frontend usage

[`@nestjs-crud/request`](https://www.npmjs.com/package/@nestjs-crud/request) is framework-agnostic and works on both backend and frontend. It is also used by [`@nestjs-crud/core`](https://www.npmjs.com/package/@nestjs-crud/core) inside `CrudRequestInterceptor`.

The `RequestQueryBuilder` class composes query strings and lets you customize param names and delimiters.

### Customize

`setOptions` is a static method that lets you override the defaults (shown below):

```typescript
import { RequestQueryBuilder } from '@nestjs-crud/request';

RequestQueryBuilder.setOptions({
  delim: '||',
  delimStr: ',',
  paramNamesMap: {
    fields: ['fields', 'select'],
    search: 's',
    filter: ['filter[]', 'filter'],
    or: ['or[]', 'or'],
    join: ['join[]', 'join'],
    sort: ['sort[]', 'sort'],
    limit: ['per_page', 'limit'],
    offset: ['offset'],
    page: ['page'],
    cache: ['cache'],
  },
});
```

### Usage

Compose a query string by chaining methods:

```typescript
import { RequestQueryBuilder, CondOperator } from '@nestjs-crud/request';

const qb = RequestQueryBuilder.create();

// set search
qb.search({
  $or: [
    {
      foo: { $notnull: true },
      baz: 1,
    },
    {
      bar: { $ne: 'test' },
    },
  ],
});

// equivalent imperative form:
qb.setFilter({ field: 'foo', operator: CondOperator.NOT_NULL })
  .setFilter({ field: 'baz', operator: '$eq', value: 1 })
  .setOr({
    field: 'bar',
    operator: CondOperator.NOT_EQUALS,
    value: 'test',
  });

qb.select(['foo', 'bar'])
  .setJoin({ field: 'company' })
  .setJoin({ field: 'profile', select: ['name', 'email'] })
  .sortBy({ field: 'bar', order: 'DESC' })
  .setLimit(20)
  .setPage(3)
  .resetCache()
  .query();
```

Or pass everything to `create`:

```typescript
const queryString = RequestQueryBuilder.create({
  fields: ['name', 'email'],
  search: { isActive: true },
  join: [{ field: 'company' }],
  sort: [{ field: 'id', order: 'DESC' }],
  page: 1,
  limit: 25,
  resetCache: true,
}).query();
```
