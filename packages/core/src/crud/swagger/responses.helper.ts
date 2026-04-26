/**
 * Response-metadata helpers: builds success / error entries per route
 * (with schema-ref prose pointing at consumer-visible DTO names) and
 * reads/writes `API_RESPONSE` reflection metadata.
 */
import { HttpStatus } from '@nestjs/common';

import { MergedCrudOptions } from '../../interfaces';
import { BaseRouteName } from '../../types';
import { safeRequire } from '../../util';
import { R } from '../reflection.helper';

export const swagger = safeRequire('@nestjs/swagger', () => require('@nestjs/swagger'));
export const swaggerConst = safeRequire('@nestjs/swagger/dist/constants', () =>
  require('@nestjs/swagger/dist/constants'),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setResponseOk(metadata: unknown, func: any): void {
  if (swaggerConst) {
    R.set(swaggerConst.DECORATORS.API_RESPONSE, metadata, func);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getResponseOk(func: any): any {
  return swaggerConst ? R.get(swaggerConst.DECORATORS.API_RESPONSE, func) || {} : {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getExtraModels(target: unknown): any[] {
  return swaggerConst ? R.get(swaggerConst.API_EXTRA_MODELS, target) || [] : [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setExtraModels(swaggerModels: any): void {
  if (swaggerConst) {
    const meta = getExtraModels(swaggerModels.get);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const models: any[] = [
      ...meta,
      ...Object.keys(swaggerModels)
        .map((name) => swaggerModels[name])
        .filter((one) => one && one.name !== swaggerModels.get.name),
    ];
    R.set(swaggerConst.DECORATORS.API_EXTRA_MODELS, models, swaggerModels.get);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createResponseMeta(name: BaseRouteName, options: MergedCrudOptions, swaggerModels: any): any {
  if (!swagger) {
    return {};
  }

  const { routes, query } = options;
  const routesWith404 = new Set<BaseRouteName>([
    'getOneBase',
    'updateOneBase',
    'replaceOneBase',
    'deleteOneBase',
    'recoverOneBase',
  ]);
  const badRequestText = name === 'getManyBase' || name === 'getOneBase' ? 'Malformed query' : 'Validation failed';

  // Build the success entry per route. Names below reference concrete DTOs assembled
  // in crud-routes.factory.setResponseModels (GetMany{Model}ResponseDto,
  // {Model}ResponseDto, etc.) so the emitted prose points at the schema shown in
  // Swagger UI's schema tree.
  const successEntry = buildSuccessEntry(name, options, swaggerModels);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

function buildSuccessEntry(
  name: BaseRouteName,
  options: MergedCrudOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  swaggerModels: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      return {
        [HttpStatus.CREATED]: {
          description: `Resource created (see ${swaggerModels.create.name})`,
          schema: { $ref: swagger.getSchemaPath(swaggerModels.create.name) },
        },
      };
    case 'createManyBase':
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

      return {
        [HttpStatus.OK]: {
          description: name === 'updateOneBase' ? 'Resource updated' : 'Resource replaced',
          schema: { $ref: swagger.getSchemaPath(dto.name) },
        },
      };
    }
  }
}
