import type { QueryOptions } from '../interfaces/query-options.interface';

/**
 * Filter a list of column names by the `allow` and `exclude` query options.
 * Pure function — no side effects, no instance state. Extracted from
 * `CrudService.getAllowedColumns` in v2.0.0 (Phase 4 ARCH-02 prerequisite).
 *
 * @since 2.0.0
 */
export function getAllowedColumns(columns: string[], options: Pick<QueryOptions, 'exclude' | 'allow'>): string[] {
  return (!options.exclude || !options.exclude.length) && (!options.allow || !options.allow.length)
    ? columns
    : columns.filter(
        (column) =>
          (options.exclude && options.exclude.length ? !options.exclude.some((col) => col === column) : true) &&
          (options.allow && options.allow.length ? options.allow.some((col) => col === column) : true),
      );
}
