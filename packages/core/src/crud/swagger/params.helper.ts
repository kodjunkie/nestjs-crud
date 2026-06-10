/**
 * Query-parameter and path-parameter metadata builders for the generated
 * CRUD routes, plus the `docsLink` Markdown helper rendered inside each
 * parameter's OpenAPI description.
 */
import { RequestQueryBuilder } from '@nestjs-crud/request';
import { isString, objKeys } from '@nestjs-crud/util';

import { MergedCrudOptions, ParamsOptions } from '../../interfaces';
import { BaseRouteName } from '../../types';
import { R } from '../reflection.helper';
import { swaggerConst } from './swagger-constants';

export function docsLink(section: string): string {
  return `<a href="https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax#${section}" target="_blank">Docs</a>`;
}

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
    description: `Comma-separated resource fields to return. Empty = all fields. ${docsLink('select')}`,
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
    description: `Adds search condition. ${docsLink('search')}`,
    required: false,
    in: 'query',
    // Emitted as a literal JSON string so OpenAPI's `example` scalar renders the raw
    // value consumers paste into `?s=...` rather than a parsed object.
    example: '{"name":{"$cont":"ali"}}',
  };
  const searchMeta = { ...searchMetaBase, schema: { type: 'string' } };

  const filterMetaBase = {
    name: filter,
    description: `Adds filter condition. ${docsLink('filter')}`,
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
    description: `Adds OR condition. ${docsLink('or')}`,
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
    description: `Adds sort by field. ${docsLink('sort')}`,
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
    description: `Adds relational resources. ${docsLink('join')}`,
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
    description: `Limit amount of resources. ${docsLink('limit')}`,
    required: false,
    in: 'query',
    example: 25,
  };
  const limitMeta = { ...limitMetaBase, schema: { type: 'integer' } };

  const offsetMetaBase = {
    name: offset,
    description: `Offset amount of resources. ${docsLink('offset')}`,
    required: false,
    in: 'query',
    example: 50,
  };
  const offsetMeta = { ...offsetMetaBase, schema: { type: 'integer' } };

  const pageMetaBase = {
    name: page,
    description: `Page portion of resources. ${docsLink('page')}`,
    required: false,
    in: 'query',
    example: 2,
  };
  const pageMeta = { ...pageMetaBase, schema: { type: 'integer' } };

  const cacheMetaBase = {
    name: cache,
    description: `Reset cache (if was enabled). ${docsLink('cache')}`,
    required: false,
    in: 'query',
    example: 0,
  };
  const cacheMeta = { ...cacheMetaBase, schema: { type: 'integer', minimum: 0, maximum: 1 } };

  const includeDeletedMetaBase = {
    name: includeDeleted,
    description: `Include deleted. ${docsLink('includeDeleted')}`,
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
