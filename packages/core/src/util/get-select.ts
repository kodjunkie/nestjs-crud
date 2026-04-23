import type { ParsedRequestParams } from '@nestjs-crud/request';

import type { QueryOptions } from '../interfaces/query-options.interface';

import { getAllowedColumns } from './get-allowed-columns';

/**
 * Compose the `builder.select(...)` column list from the parsed request,
 * route options, and entity-metadata column lists. Pure function — no
 * instance state, all entity-state inputs passed as arguments.
 * Extracted from `TypeOrmCrudService.getSelect` in v2.0.0.
 *
 * @since 2.0.0
 */
export function getSelect(
  parsed: ParsedRequestParams,
  options: QueryOptions,
  entityColumns: string[],
  entityPrimaryColumns: string[],
  alias: string,
): string[] {
  const allowed = getAllowedColumns(entityColumns, options);
  const columns =
    parsed.fields && parsed.fields.length
      ? parsed.fields.filter((field) => allowed.some((col) => field === col))
      : allowed;
  const select = new Set(
    [...(options.persist && options.persist.length ? options.persist : []), ...columns, ...entityPrimaryColumns].map(
      (col) => `${alias}.${col}`,
    ),
  );
  return Array.from(select);
}
