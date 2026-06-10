/**
 * Query-parameter and path-parameter metadata builders for the generated
 * CRUD routes. Parameter descriptions are written for API consumers and
 * are self-contained — no library internals or external doc links.
 */
import { RequestQueryBuilder } from '@nestjs-crud/request';
import { isString, objKeys } from '@nestjs-crud/util';

import { MergedCrudOptions, ParamsOptions } from '../../interfaces';
import { BaseRouteName } from '../../types';
import { R } from '../reflection.helper';
import { swaggerConst } from './swagger-constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setParams(metadata: unknown, func: any): void {
  if (swaggerConst) {
    R.set(swaggerConst.DECORATORS.API_PARAMETERS, metadata, func);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getParams(func: any): any[] {
  return swaggerConst ? R.get(swaggerConst.DECORATORS.API_PARAMETERS, func) || [] : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPathParamsMeta(options: ParamsOptions): any[] {
  return swaggerConst
    ? objKeys(options).map((param) => ({
        name: param,
        required: true,
        in: 'path',
        type: options[param].type === 'number' ? Number : String,
        enum: options[param].enum ? Object.values(options[param].enum) : undefined,
      }))
    : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getQueryParamsNames(): any {
  const qbOptions = RequestQueryBuilder.getOptions();
  const name = (n) => {
    const selected = qbOptions.paramNamesMap[n];
    return isString(selected) ? selected : selected[0];
  };

  return {
    delim: qbOptions.delim,
    delimStr: qbOptions.delimStr,
    fields: name('fields'),
    search: name('search'),
    filter: name('filter'),
    or: name('or'),
    join: name('join'),
    sort: name('sort'),
    limit: name('limit'),
    offset: name('offset'),
    page: name('page'),
    cache: name('cache'),
    includeDeleted: name('includeDeleted'),
  };
}

export function createQueryParamsMeta(name: BaseRouteName, options: MergedCrudOptions) {
  if (!swaggerConst) {
    return [];
  }

  const {
    delim: _d,
    delimStr: _coma,
    fields,
    search,
    filter,
    or,
    join,
    sort,
    limit,
    offset,
    page,
    cache,
    includeDeleted,
  } = getQueryParamsNames();

  const fieldsMetaBase = {
    name: fields,
    description: 'Comma-separated list of fields to return. Empty = all fields.',
    required: false,
    in: 'query',
    example: 'id,name,email',
  };
  const fieldsMeta = {
    ...fieldsMetaBase,
    schema: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    style: 'form',
    explode: false,
  };

  const searchMetaBase = {
    name: search,
    description:
      'Search condition as a JSON object. Field conditions support operators such as `$eq`, `$ne`, `$gt`, `$lt`, `$cont` (contains), `$in`, and may be combined with `$and` / `$or`.',
    required: false,
    in: 'query',
    // Emitted as a literal JSON string so OpenAPI's `example` scalar renders the raw
    // value consumers paste into `?s=...` rather than a parsed object.
    example: '{"name":{"$cont":"ali"}}',
  };
  const searchMeta = { ...searchMetaBase, schema: { type: 'string' } };

  const filterMetaBase = {
    name: filter,
    description:
      'Filter condition in the form `field||$operator||value`. Repeatable; multiple filters are combined with AND.',
    required: false,
    in: 'query',
    example: 'age||$gte||18',
  };
  const filterMeta = {
    ...filterMetaBase,
    schema: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    style: 'form',
    explode: true,
  };

  const orMetaBase = {
    name: or,
    description:
      'Filter condition in the form `field||$operator||value`, combined with OR against other conditions. Repeatable.',
    required: false,
    in: 'query',
    example: 'status||$eq||active',
  };
  const orMeta = {
    ...orMetaBase,
    schema: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    style: 'form',
    explode: true,
  };

  const sortMetaBase = {
    name: sort,
    description: 'Sort order in the form `field,ASC` or `field,DESC`. Repeatable.',
    required: false,
    in: 'query',
    example: 'name,ASC',
  };
  const sortMeta = {
    ...sortMetaBase,
    schema: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    style: 'form',
    explode: true,
  };

  const joinMetaBase = {
    name: join,
    description:
      'Related resource to include, in the form `relation` or `relation||field1,field2` to select specific fields. Repeatable.',
    required: false,
    in: 'query',
    example: 'profile||bio,avatar',
  };
  const joinMeta = {
    ...joinMetaBase,
    schema: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
    style: 'form',
    explode: true,
  };

  const limitMetaBase = {
    name: limit,
    description: 'Maximum number of resources to return.',
    required: false,
    in: 'query',
    example: 25,
  };
  const limitMeta = { ...limitMetaBase, schema: { type: 'integer' } };

  const offsetMetaBase = {
    name: offset,
    description: 'Number of resources to skip.',
    required: false,
    in: 'query',
    example: 50,
  };
  const offsetMeta = { ...offsetMetaBase, schema: { type: 'integer' } };

  const pageMetaBase = {
    name: page,
    description: 'Page number, used together with `limit`.',
    required: false,
    in: 'query',
    example: 2,
  };
  const pageMeta = { ...pageMetaBase, schema: { type: 'integer' } };

  const cacheMetaBase = {
    name: cache,
    description: 'Set to `0` to bypass the cache for this request (when caching is enabled).',
    required: false,
    in: 'query',
    example: 0,
  };
  const cacheMeta = { ...cacheMetaBase, schema: { type: 'integer', minimum: 0, maximum: 1 } };

  const includeDeletedMetaBase = {
    name: includeDeleted,
    description: 'Set to `1` to include soft-deleted records in the result.',
    required: false,
    in: 'query',
    example: 1,
  };
  const includeDeletedMeta = {
    ...includeDeletedMetaBase,
    schema: { type: 'integer', minimum: 0, maximum: 1 },
  };

  switch (name) {
    case 'getManyBase':
      return options.query.softDelete
        ? [
            fieldsMeta,
            searchMeta,
            filterMeta,
            orMeta,
            sortMeta,
            joinMeta,
            limitMeta,
            offsetMeta,
            pageMeta,
            cacheMeta,
            includeDeletedMeta,
          ]
        : [fieldsMeta, searchMeta, filterMeta, orMeta, sortMeta, joinMeta, limitMeta, offsetMeta, pageMeta, cacheMeta];
    case 'getOneBase':
      return options.query.softDelete
        ? [fieldsMeta, joinMeta, cacheMeta, includeDeletedMeta]
        : [fieldsMeta, joinMeta, cacheMeta];
    default:
      return [];
  }
}
