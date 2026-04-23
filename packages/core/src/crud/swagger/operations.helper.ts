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
import { safeRequire } from '../../util';
import { R } from '../reflection.helper';

const swaggerConst = safeRequire('@nestjs/swagger/dist/constants', () =>
  require('@nestjs/swagger/dist/constants'),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pluralize: (word: string) => string =
  typeof pluralizeNs === 'function' ? (pluralizeNs as any) : (pluralizeNs as any).default;

export function operationsMap(
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
