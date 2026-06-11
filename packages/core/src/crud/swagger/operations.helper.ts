/**
 * Per-route operation summaries and Markdown description bodies emitted as
 * OpenAPI `summary` / `description` for the eight generated CRUD routes,
 * plus thin reflection wrappers around `API_OPERATION` metadata.
 */
// ESM-safe: pluralize is a hard dep; import * as unwraps correctly in both CJS
// (ts-jest default-esm preset returns the function directly) and native ESM
// (function at .default).
import * as pluralizeNs from 'pluralize';

import { BaseRouteName } from '../../types';
import { R } from '../reflection.helper';
import { swaggerConst } from './swagger-constants';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pluralize: (word: string) => string =
  typeof pluralizeNs === 'function' ? (pluralizeNs as any) : (pluralizeNs as any).default;

// Full query-grammar reference linked once per list/get operation (the only routes
// with a query surface). Hardcoded for now; a `swagger.queryDocsUrl` config knob
// (route-level → global → this default, `false` to disable) is the planned follow-up.
const QUERY_DOCS_URL = 'https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax';
const QUERY_DOCS_LINE = `Full query syntax reference: [Query Syntax](${QUERY_DOCS_URL}).`;

export function operationsMap(modelName: string, softDelete = false): { [key in BaseRouteName]: { summary: string; description: string } } {
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
        ...(softDelete
          ? ['', 'Soft-deleted records are excluded by default; pass `?includeDeleted=1` to include them.']
          : []),
        '',
        QUERY_DOCS_LINE,
      ].join('\n'),
    },
    getOneBase: {
      summary: `Get ${lower} by id`,
      description: [
        `Returns a single ${lower} matching the id path parameter.`,
        '',
        'Supports field selection (`?fields=`) and relation loading (`?join=`).',
        ...(softDelete
          ? ['Soft-deleted records are excluded by default; pass `?includeDeleted=1` to include them.']
          : []),
        '',
        QUERY_DOCS_LINE,
      ].join('\n'),
    },
    createOneBase: {
      summary: `Create ${lower}`,
      description: [
        `Creates a single ${lower} from the request body.`,
        '',
        'Fields marked as required must be present in the request body.',
      ].join('\n'),
    },
    createManyBase: {
      summary: `Create ${lowerPlural} in bulk`,
      description: [
        `Creates multiple ${lowerPlural} in a single request.`,
        '',
        'The request body uses the wrapper shape `{ "bulk": [ ... ] }`. Each element is',
        'validated; required fields must be present. The bulk insert runs inside a single',
        'transaction, so either all records are persisted or none are.',
      ].join('\n'),
    },
    updateOneBase: {
      summary: `Partially update ${lower}`,
      description: [
        `Partially updates a single ${lower} (HTTP PATCH semantics).`,
        '',
        'Only the fields present in the request body are modified; omitted fields retain',
        'their current values.',
      ].join('\n'),
    },
    replaceOneBase: {
      summary: `Replace ${lower}`,
      description: [
        `Replaces a single ${lower} (HTTP PUT semantics) with the full request body.`,
        '',
        'All entity fields are substituted from the payload, not merged — values omitted',
        'from the body are cleared to defaults.',
      ].join('\n'),
    },
    deleteOneBase: {
      summary: `Delete ${lower}`,
      description: softDelete
        ? [
            `Soft-deletes the record (marks it deleted and excludes it from default reads;`,
            'use the recover endpoint to restore).',
          ].join('\n')
        : `Permanently removes the ${lower}.`,
    },
    recoverOneBase: {
      summary: `Restore soft-deleted ${lower}`,
      description: [
        `Restores a previously soft-deleted ${lower}.`,
        '',
        `Permanently deleted ${lowerPlural} cannot be recovered.`,
      ].join('\n'),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setOperation(metadata: unknown, func: any): void {
  if (swaggerConst) {
    R.set(swaggerConst.DECORATORS.API_OPERATION, metadata, func);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOperation(func: any): any {
  return swaggerConst ? R.get(swaggerConst.DECORATORS.API_OPERATION, func) || {} : {};
}
