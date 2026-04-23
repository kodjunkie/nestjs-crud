/**
 * Body-example synthesis for the generated CRUD routes.
 *
 * Three-tier dispatch (evaluated in this exact order):
 *   1. When a consumer-supplied synthesizer is passed and both `modelType` and
 *      `route` are present, its return value is used verbatim.
 *   2. Otherwise, `@ApiProperty` metadata on the model's prototype is
 *      introspected and placeholder values are synthesized per property type.
 *   3. Otherwise, an empty object is returned.
 */
import type { CrudSwaggerSynthExampleFn } from '../../interfaces/crud-swagger-options.interface';
import { BaseRouteName } from '../../types';
import { safeRequire } from '../../util';

const swaggerConst = safeRequire('@nestjs/swagger/dist/constants', () => require('@nestjs/swagger/dist/constants'));

// cited: node_modules/@nestjs/swagger/dist/constants.js line 15 for
// DECORATORS.API_MODEL_PROPERTIES_ARRAY, line 14 for DECORATORS.API_MODEL_PROPERTIES.
export function synthesizeBodyExample(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Null-guard on the optional @nestjs/swagger peer dep: when absent (or modelType
  // missing), bail with an empty object — the consumer sees no example emitted.
  if (swaggerConst) {
    return introspectApiPropertyExample(modelType);
  }

  return {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function introspectApiPropertyExample(modelType: any): Record<string, unknown> {
  if (!modelType) {
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
    } else if (declaredType === Number || declaredType === 'number' || declaredType === 'integer') {
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
