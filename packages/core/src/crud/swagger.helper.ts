import { RequestQueryBuilder } from '@nestjs-crud/request';
import { isString, objKeys } from '@nestjs-crud/util';
import { HttpStatus } from '@nestjs/common';
// ESM-safe: pluralize is a hard dep; import * as unwraps correctly in both CJS (ts-jest
// default-esm preset returns the function directly) and native ESM (function at .default).
import * as pluralizeNs from 'pluralize';
import type { CrudSwaggerSynthExampleFn } from '../interfaces/crud-swagger-options.interface';
import { MergedCrudOptions, ParamsOptions } from '../interfaces';
import { BaseRouteName } from '../types';
import { safeRequire } from '../util';
import { R } from './reflection.helper';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pluralize: (word: string) => string =
  typeof pluralizeNs === 'function' ? (pluralizeNs as any) : (pluralizeNs as any).default;

export const swagger = safeRequire('@nestjs/swagger', () => require('@nestjs/swagger'));
export const swaggerConst = safeRequire('@nestjs/swagger/dist/constants', () =>
  require('@nestjs/swagger/dist/constants'),
);
export const swaggerPkgJson = safeRequire('@nestjs/swagger/package.json', () =>
  require('@nestjs/swagger/package.json'),
);

export class Swagger {
  static operationsMap(
    modelName: string,
  ): { [key in BaseRouteName]: { summary: string; description: string } } {
    const lower = modelName.toLowerCase();
    const lowerPlural = pluralize(lower);

    return {
      getManyBase: {
        summary: `List ${lowerPlural}`,
        description: [
          `Returns a paginated list of ${lowerPlural}.`,
          '',
          'Supports field selection (`?fields=`), search (`?s=`), filter (`?filter=`), OR',
          'filter (`?or=`), sort (`?sort=`), relation loading (`?join=`), and pagination',
          '(`?limit=`, `?offset=`, `?page=`).',
          '',
          'When the controller is configured with `@Crud({ query: { softDelete: true } })`,',
          'soft-deleted rows are excluded by default; pass `?includeDeleted=1` to include them.',
        ].join('\n'),
      },
      getOneBase: {
        summary: `Get ${lower} by id`,
        description: [
          `Returns a single ${lower} matching the id path parameter.`,
          '',
          'Supports field selection (`?fields=`) and relation loading (`?join=`). When the',
          'controller is configured with `@Crud({ query: { softDelete: true } })`, soft-deleted',
          'rows are excluded by default; pass `?includeDeleted=1` to include them.',
        ].join('\n'),
      },
      createOneBase: {
        summary: `Create ${lower}`,
        description: [
          `Creates a single ${lower} from the request body.`,
          '',
          'Validation uses the `CrudValidationGroups.CREATE` group. When a dedicated create',
          'DTO is provided via `@Crud({ dto: { create } })`, the DTO class drives validation;',
          'otherwise validation is performed against the entity with the CREATE group.',
        ].join('\n'),
      },
      createManyBase: {
        summary: `Create ${lowerPlural} in bulk`,
        description: [
          `Creates multiple ${lowerPlural} in a single request.`,
          '',
          'The request body uses the wrapper shape `{ "bulk": [ ... ] }`. Each element is',
          'validated with the `CrudValidationGroups.CREATE` group. The bulk insert runs inside',
          'a single transaction so either all rows are persisted or none are.',
        ].join('\n'),
      },
      updateOneBase: {
        summary: `Partially update ${lower}`,
        description: [
          `Partially updates a single ${lower} (HTTP PATCH semantics).`,
          '',
          'Only the fields present in the request body are modified; omitted fields retain',
          'their current values. Validation uses the `CrudValidationGroups.UPDATE` group,',
          'which typically relaxes required-field constraints versus CREATE.',
        ].join('\n'),
      },
      replaceOneBase: {
        summary: `Replace ${lower}`,
        description: [
          `Replaces a single ${lower} (HTTP PUT semantics) with the full request body.`,
          '',
          'All entity fields are substituted from the payload, not merged — values omitted',
          'from the body are cleared to defaults. When upsert behavior is enabled for the',
          'route, a missing target id triggers creation instead of a 404.',
        ].join('\n'),
      },
      deleteOneBase: {
        summary: `Delete ${lower}`,
        description: [
          `Removes a single ${lower} by id.`,
          '',
          'When the entity has a soft-delete column and the controller is configured with',
          '`@Crud({ query: { softDelete: true } })`, the row is soft-deleted (delete column',
          'set to the current timestamp). Otherwise the row is hard-deleted.',
        ].join('\n'),
      },
      recoverOneBase: {
        summary: `Restore soft-deleted ${lower}`,
        description: [
          `Restores a previously soft-deleted ${lower} by clearing its delete column.`,
          '',
          'Requires the entity to expose a soft-delete column and the controller to be',
          `configured with \`@Crud({ query: { softDelete: true } })\`. Hard-deleted ${lowerPlural}`,
          'cannot be recovered.',
        ].join('\n'),
      },
    };
  }

  static setOperation(metadata: unknown, func: any): void {
    if (swaggerConst) {
      R.set(swaggerConst.DECORATORS.API_OPERATION, metadata, func);
    }
  }

  static setParams(metadata: unknown, func: any): void {
    if (swaggerConst) {
      R.set(swaggerConst.DECORATORS.API_PARAMETERS, metadata, func);
    }
  }

  static setExtraModels(swaggerModels: any): void {
    if (swaggerConst) {
      const meta = Swagger.getExtraModels(swaggerModels.get);
      const models: any[] = [
        ...meta,
        ...objKeys(swaggerModels)
          .map((name) => swaggerModels[name])
          .filter((one) => one && one.name !== swaggerModels.get.name),
      ];
      R.set(swaggerConst.DECORATORS.API_EXTRA_MODELS, models, swaggerModels.get);
    }
  }

  static setResponseOk(metadata: unknown, func: any): void {
    if (swaggerConst) {
      R.set(swaggerConst.DECORATORS.API_RESPONSE, metadata, func);
    }
  }

  static getOperation(func: any): any {
    return swaggerConst ? R.get(swaggerConst.DECORATORS.API_OPERATION, func) || {} : {};
  }

  static getParams(func: any): any[] {
    return swaggerConst ? R.get(swaggerConst.DECORATORS.API_PARAMETERS, func) || [] : [];
  }

  static getExtraModels(target: unknown): any[] {
    return swaggerConst ? R.get(swaggerConst.API_EXTRA_MODELS, target) || [] : [];
  }

  static getResponseOk(func: any): any {
    return swaggerConst ? R.get(swaggerConst.DECORATORS.API_RESPONSE, func) || {} : {};
  }

  static createResponseMeta(name: BaseRouteName, options: MergedCrudOptions, swaggerModels: any): any {
    if (!swagger) {
      return {};
    }

    const { routes, query } = options;
    const oldVersion = Swagger.getSwaggerVersion() < 4;
    const routesWith404 = new Set<BaseRouteName>([
      'getOneBase',
      'updateOneBase',
      'replaceOneBase',
      'deleteOneBase',
      'recoverOneBase',
    ]);
    const badRequestText =
      name === 'getManyBase' || name === 'getOneBase' ? 'Malformed query' : 'Validation failed';

    // Build the success entry per route. Names below reference concrete DTOs assembled
    // in crud-routes.factory.setResponseModels (GetMany{Model}ResponseDto,
    // {Model}ResponseDto, etc.) so the emitted prose points at the schema shown in
    // Swagger UI's schema tree.
    const successEntry = Swagger.buildSuccessEntry(name, options, swaggerModels, oldVersion);
    const meta: Record<number, any> = { ...successEntry };

    // 400 is emitted on every generated route. 401 is owned by the factory layer
    // (conditional on @CrudAuth() or errorResponses.unauthorized opt-in).
    meta[HttpStatus.BAD_REQUEST] = { description: badRequestText };

    if (routesWith404.has(name)) {
      meta[HttpStatus.NOT_FOUND] = { description: 'Resource not found' };
    }

    // Reference `query` so the closure-captured options are not flagged as unused by
    // lint — query.alwaysPaginate is consumed inside buildSuccessEntry via the same
    // options object.
    void query;
    void routes;

    return meta;
  }

  static createPathParamsMeta(options: ParamsOptions): any[] {
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

  static createQueryParamsMeta(name: BaseRouteName, options: MergedCrudOptions) {
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
    } = Swagger.getQueryParamsNames();
    const oldVersion = Swagger.getSwaggerVersion() < 4;
    const docsLink = (a: string) =>
      `<a href="https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax#${a}" target="_blank">Docs</a>`;

    const fieldsMetaBase = {
      name: fields,
      description: `Comma-separated resource fields to return. Empty = all fields. ${docsLink('select')}`,
      required: false,
      in: 'query',
      example: 'id,name,email',
    };
    const fieldsMeta = oldVersion
      ? {
          ...fieldsMetaBase,
          type: 'array',
          items: {
            type: 'string',
          },
          collectionFormat: 'csv',
        }
      : {
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
    const searchMeta = oldVersion
      ? { ...searchMetaBase, type: 'string' }
      : { ...searchMetaBase, schema: { type: 'string' } };

    const filterMetaBase = {
      name: filter,
      description: `Adds filter condition. ${docsLink('filter')}`,
      required: false,
      in: 'query',
      example: 'age||$gte||18',
    };
    const filterMeta = oldVersion
      ? {
          ...filterMetaBase,
          items: {
            type: 'string',
          },
          type: 'array',
          collectionFormat: 'multi',
        }
      : {
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
    const orMeta = oldVersion
      ? {
          ...orMetaBase,
          items: {
            type: 'string',
          },
          type: 'array',
          collectionFormat: 'multi',
        }
      : {
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
    const sortMeta = oldVersion
      ? {
          ...sortMetaBase,
          items: {
            type: 'string',
          },
          type: 'array',
          collectionFormat: 'multi',
        }
      : {
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
    const joinMeta = oldVersion
      ? {
          ...joinMetaBase,
          items: {
            type: 'string',
          },
          type: 'array',
          collectionFormat: 'multi',
        }
      : {
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
    const limitMeta = oldVersion
      ? { ...limitMetaBase, type: 'integer' }
      : { ...limitMetaBase, schema: { type: 'integer' } };

    const offsetMetaBase = {
      name: offset,
      description: `Offset amount of resources. ${docsLink('offset')}`,
      required: false,
      in: 'query',
      example: 50,
    };
    const offsetMeta = oldVersion
      ? { ...offsetMetaBase, type: 'integer' }
      : { ...offsetMetaBase, schema: { type: 'integer' } };

    const pageMetaBase = {
      name: page,
      description: `Page portion of resources. ${docsLink('page')}`,
      required: false,
      in: 'query',
      example: 2,
    };
    const pageMeta = oldVersion
      ? { ...pageMetaBase, type: 'integer' }
      : { ...pageMetaBase, schema: { type: 'integer' } };

    const cacheMetaBase = {
      name: cache,
      description: `Reset cache (if was enabled). ${docsLink('cache')}`,
      required: false,
      in: 'query',
      example: 0,
    };
    const cacheMeta = oldVersion
      ? {
          ...cacheMetaBase,
          type: 'integer',
          minimum: 0,
          maximum: 1,
        }
      : { ...cacheMetaBase, schema: { type: 'integer', minimum: 0, maximum: 1 } };

    const includeDeletedMetaBase = {
      name: includeDeleted,
      description: `Include deleted. ${docsLink('includeDeleted')}`,
      required: false,
      in: 'query',
      example: 1,
    };
    const includeDeletedMeta = oldVersion
      ? {
          ...includeDeletedMetaBase,
          type: 'integer',
          minimum: 0,
          maximum: 1,
        }
      : {
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
          : [
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
            ];
      case 'getOneBase':
        return options.query.softDelete
          ? [fieldsMeta, joinMeta, cacheMeta, includeDeletedMeta]
          : [fieldsMeta, joinMeta, cacheMeta];
      default:
        return [];
    }
  }

  static getQueryParamsNames(): any {
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

  /**
   * Synthesize a request-body example for a generated route.
   *
   * Three-tier dispatch (evaluated in this exact order):
   *   1. When a consumer-supplied synthesizer is passed and both `modelType` and `route`
   *      are present, its return value is used verbatim.
   *   2. Otherwise, `@ApiProperty` metadata on the model's prototype is introspected and
   *      placeholder values are synthesized per property type.
   *   3. Otherwise, an empty object is returned.
   *
   * The helper is pure: no Swagger metadata is emitted here. Consumers who want full
   * control over the bulk wrapper shape can inspect the `route` argument and return the
   * wrapped payload directly; the factory applies a convenience `{ bulk: [...] }` wrap
   * only for the `createManyBase` route.
   */
  // cited: node_modules/@nestjs/swagger/dist/constants.js line 15 for
  // DECORATORS.API_MODEL_PROPERTIES_ARRAY, line 14 for DECORATORS.API_MODEL_PROPERTIES.
  static synthesizeBodyExample(
    modelType: any,
    consumerSynth?: CrudSwaggerSynthExampleFn,
    route?: BaseRouteName,
  ): Record<string, unknown> | unknown {
    // Tier 1: consumer-supplied synthesizer wins and short-circuits before any
    // introspection runs. Both modelType and route must be truthy so the consumer
    // always receives a well-formed call site.
    if (typeof consumerSynth === 'function' && modelType && route) {
      return consumerSynth(modelType, route);
    }

    if (!swaggerConst || !modelType) {
      return {};
    }

    // Tier 2: @ApiProperty introspection. Metadata layout verified against
    // node_modules/@nestjs/swagger/dist/decorators/helpers.js:38-48 — the property array
    // is stored on the class prototype under DECORATORS.API_MODEL_PROPERTIES_ARRAY as
    // `:propName` strings, and per-property options are stored on the prototype at
    // (DECORATORS.API_MODEL_PROPERTIES, propName) via Reflect.defineMetadata's 3-arg
    // form (NOT concatenated into the key).
    const propsKey = swaggerConst.DECORATORS.API_MODEL_PROPERTIES_ARRAY;
    const perPropKey = swaggerConst.DECORATORS.API_MODEL_PROPERTIES;
    const prototype = modelType.prototype;

    if (!prototype) {
      return {};
    }

    const propList: string[] = Reflect.getMetadata(propsKey, prototype) || [];

    if (propList.length === 0) {
      return {};
    }

    const out: Record<string, unknown> = {};

    for (const raw of propList) {
      const propName = raw.startsWith(':') ? raw.slice(1) : raw;
      const meta = Reflect.getMetadata(perPropKey, prototype, propName) || {};
      const declaredType = meta.type;
      const fmt = meta.format;

      if (fmt === 'uuid') {
        out[propName] = '00000000-0000-0000-0000-000000000000';
      } else if (fmt === 'date-time' || declaredType === Date) {
        out[propName] = '2026-04-23T00:00:00.000Z';
      } else if (declaredType === String || declaredType === 'string') {
        out[propName] = 'string';
      } else if (
        declaredType === Number ||
        declaredType === 'number' ||
        declaredType === 'integer'
      ) {
        out[propName] = 0;
      } else if (declaredType === Boolean || declaredType === 'boolean') {
        out[propName] = true;
      }
      // Relations (declaredType is a function referencing another class) and virtual /
      // unknown-typed columns are intentionally skipped — single-level synthesis only,
      // no recursion, no cycle risk.
    }

    return out;
  }

  private static buildSuccessEntry(
    name: BaseRouteName,
    options: MergedCrudOptions,
    swaggerModels: any,
    oldVersion: boolean,
  ): Record<number, any> {
    const { routes, query } = options;

    switch (name) {
      case 'getOneBase':
        return {
          [HttpStatus.OK]: {
            description: `Resource matching id (see ${swaggerModels.get.name})`,
            type: swaggerModels.get,
          },
        };
      case 'getManyBase':
        if (oldVersion) {
          return {
            [HttpStatus.OK]: {
              type: swaggerModels.getMany,
            },
          };
        }
        return {
          [HttpStatus.OK]: query.alwaysPaginate
            ? {
                description: `Paginated list of matching resources (see ${swaggerModels.getMany.name})`,
                type: swaggerModels.getMany,
              }
            : {
                description: `Paginated list of matching resources (see ${swaggerModels.getMany.name})`,
                schema: {
                  oneOf: [
                    { $ref: swagger.getSchemaPath(swaggerModels.getMany.name) },
                    {
                      type: 'array',
                      items: { $ref: swagger.getSchemaPath(swaggerModels.get.name) },
                    },
                  ],
                },
              },
        };
      case 'createOneBase':
        if (oldVersion) {
          return {
            [HttpStatus.OK]: {
              type: swaggerModels.create,
            },
          };
        }
        return {
          [HttpStatus.CREATED]: {
            description: `Resource created (see ${swaggerModels.create.name})`,
            schema: { $ref: swagger.getSchemaPath(swaggerModels.create.name) },
          },
        };
      case 'createManyBase':
        if (oldVersion) {
          return {
            [HttpStatus.OK]: {
              type: swaggerModels.create,
              isArray: true,
            },
          };
        }
        return {
          [HttpStatus.CREATED]: swaggerModels.createMany
            ? {
                description: `Resources created in bulk (see ${swaggerModels.createMany.name})`,
                schema: { $ref: swagger.getSchemaPath(swaggerModels.createMany.name) },
              }
            : {
                description: `Resources created in bulk (see ${swaggerModels.create.name})`,
                schema: {
                  type: 'array',
                  items: { $ref: swagger.getSchemaPath(swaggerModels.create.name) },
                },
              },
        };
      case 'deleteOneBase':
        if (oldVersion) {
          return {
            [HttpStatus.OK]: routes.deleteOneBase.returnDeleted
              ? {
                  type: swaggerModels.delete,
                }
              : {},
          };
        }
        return {
          [HttpStatus.OK]: routes.deleteOneBase.returnDeleted
            ? {
                description: `Resource removed (see ${swaggerModels.delete.name})`,
                schema: { $ref: swagger.getSchemaPath(swaggerModels.delete.name) },
              }
            : {
                description: 'Resource removed',
              },
        };
      case 'recoverOneBase':
        if (oldVersion) {
          return {
            [HttpStatus.OK]: routes.recoverOneBase.returnRecovered
              ? {
                  type: swaggerModels.recover,
                }
              : {},
          };
        }
        return {
          [HttpStatus.OK]: routes.recoverOneBase.returnRecovered
            ? {
                description: `Resource restored (see ${swaggerModels.recover.name})`,
                schema: { $ref: swagger.getSchemaPath(swaggerModels.recover.name) },
              }
            : {
                description: 'Resource restored',
              },
        };
      default: {
        const dto = swaggerModels[name.split('OneBase')[0]];

        if (oldVersion) {
          return {
            [HttpStatus.OK]: {
              type: dto,
            },
          };
        }

        return {
          [HttpStatus.OK]: {
            description: name === 'updateOneBase' ? 'Resource updated' : 'Resource replaced',
            schema: { $ref: swagger.getSchemaPath(dto.name) },
          },
        };
      }
    }
  }

  private static getSwaggerVersion(): number {
    return swaggerPkgJson ? parseInt(swaggerPkgJson.version.split('.')[0], 10) : 3;
  }
}

// tslint:disable-next-line:ban-types
export function ApiProperty(options?: any): PropertyDecorator {
  return (target: unknown, propertyKey: string | symbol) => {
    if (swagger) {
      // tslint:disable-next-line
      const ApiPropertyDecorator = swagger.ApiProperty || swagger.ApiModelProperty;
      // tslint:disable-next-line
      ApiPropertyDecorator(options)(target, propertyKey);
    }
  };
}
