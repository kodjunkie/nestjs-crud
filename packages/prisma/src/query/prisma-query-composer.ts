import { getAllowedColumns } from '@nestjs-crud/core';
import type { CursorPayload } from '@nestjs-crud/core/cursor';
import type { QueryComposer, WhereBuilder } from '@nestjs-crud/core/query';
import type { CrudRequestOptions, JoinOptions, JoinResolver } from '@nestjs-crud/core';
import type { ParsedRequestParams, QuerySort } from '@nestjs-crud/request';

/**
 * @internal — subject to change without semver-major.
 * Applies WHERE + sort + pagination + field selection + soft-delete + eager joins to a Prisma arg object.
 *
 * **OWNS the SQLi invariant**: the dotted-path sort branch validates
 * `relation` + `column` against `joinResolver.getAllowedColumnsFor(relation)`
 * before any identifier reaches Prisma's orderBy.
 *
 * Spike landmines respected:
 * - L1: no `previewFeatures = ["relationJoins"]` forced
 * - L2: to-one relation soft-delete compiles to parent-level `where`, NEVER inside `include`
 * - L3: `include` does NOT auto-filter soft-deleted relations (consumer opt-in only)
 *
 * @since 2.0.0
 */

// Type debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export interface PrismaQueryComposerConfig {
  entityColumns: string[];

  entityPrimaryColumns: string[];

  entityHasDeleteColumn: boolean;

  softDeleteColumn: string | null;

  onBadRequest: (msg: string) => void;

  joinResolver: JoinResolver<any>;

  whereBuilder: WhereBuilder<any, Record<string, any>>;

  relationFields: string[];
}

export class PrismaQueryComposer implements QueryComposer<any> {
  private readonly entityColumns: string[];

  private readonly entityPrimaryColumns: string[];

  private readonly entityHasDeleteColumn: boolean;

  private readonly softDeleteColumn: string | null;

  private readonly onBadRequest: (msg: string) => void;

  private readonly joinResolver: JoinResolver<any>;

  private readonly whereBuilder: WhereBuilder<any, Record<string, any>>;

  private readonly relationFields: string[];

  constructor(config: PrismaQueryComposerConfig) {
    this.entityColumns = config.entityColumns;
    this.entityPrimaryColumns = config.entityPrimaryColumns;
    this.entityHasDeleteColumn = config.entityHasDeleteColumn;
    this.softDeleteColumn = config.softDeleteColumn;
    this.onBadRequest = config.onBadRequest;
    this.joinResolver = config.joinResolver;
    this.whereBuilder = config.whereBuilder;
    this.relationFields = config.relationFields;
  }

  public applyToQuery(q: any, parsed: ParsedRequestParams, options: CrudRequestOptions): any {
    const out: any = { ...q };
    const queryOptions = options?.query ?? {};

    // 1. WHERE via injected WhereBuilder
    const whereParts: any[] = [];
    const searchWhere = parsed.search ? this.whereBuilder.build(parsed.search) : {};
    if (searchWhere && Object.keys(searchWhere).length) {
      whereParts.push(searchWhere);
    }

    // 2. Soft-delete (L2: parent-level only; L3: no auto-filter in include)
    if (this.entityHasDeleteColumn && this.softDeleteColumn && !parsed.includeDeleted && queryOptions.softDelete) {
      whereParts.push({ [this.softDeleteColumn]: null });
    }

    if (whereParts.length === 1) {
      out.where = whereParts[0];
    } else if (whereParts.length > 1) {
      out.where = { AND: whereParts };
    }

    // 3. Sort — ASC/DESC → asc/desc; dotted-path via JoinResolver allowlist (SQLi guard)
    if (parsed.sort?.length) {
      out.orderBy = parsed.sort.map((s) => this.compileSort(s));
    }

    // 4. Pagination
    const take = this.getTake(parsed, queryOptions);
    const skip = this.getSkip(parsed, take as number);
    if (take) out.take = take;
    if (skip) out.skip = skip;

    // 5. Select / fields
    const select = this.getSelectObject(parsed, options);
    if (select) out.select = select;

    // 6. Include — eager joins + client-requested joins from options.query.join and parsed.join
    const include = this.getIncludeObject(parsed, options);
    if (include && Object.keys(include).length) out.include = include;

    return out;
  }

  public getTake(query: ParsedRequestParams, options: CrudRequestOptions['query']): number | null {
    const opts = options ?? {};
    if (query.limit) {
      return opts.maxLimit ? (query.limit <= opts.maxLimit ? query.limit : opts.maxLimit) : query.limit;
    }
    if (opts.limit) {
      return opts.maxLimit ? (opts.limit <= opts.maxLimit ? opts.limit : opts.maxLimit) : opts.limit;
    }
    return opts.maxLimit ? opts.maxLimit : null;
  }

  public getSkip(query: ParsedRequestParams, take: number): number | null {
    return query.page && take ? take * (query.page - 1) : query.offset ? query.offset : null;
  }

  /**
   * Apply the cursor-mode field allowlist + ORDER BY (with PK tie-breaker) on
   * top of the already-composed Prisma arg-object. The allowlist check and the
   * ORDER BY assignment run on every call, including the first page — a
   * defaulted sort field reaches `orderBy` on the same path a client-supplied
   * field does. Only the keyset WHERE composition is gated on a decoded
   * cursor, since there is no prior page position to resume from.
   *
   * SQLi guard: validates `sort.field` via the same `entityColumns` allowlist
   * used by `compileSort`.
   *
   * Bypasses Prisma's built-in `cursor:` arg — that argument is single-column
   * unique-key only and cannot accept `(sortField, id)` tuple semantics.
   *
   * @since 2.2.0
   */
  public applyCursor(out: any, decoded: CursorPayload | null, sort: QuerySort): any {
    if (!this.entityColumns.includes(sort.field)) {
      this.onBadRequest(`Invalid sort field: '${sort.field}'`);
    }

    const isAsc = sort.order === 'ASC';
    // No decoded cursor means a first page, which is forward by definition.
    const isForward = !decoded || decoded.dir === 'next';
    const op = isAsc === isForward ? 'gt' : 'lt';
    const dir: 'asc' | 'desc' = isAsc === isForward ? 'asc' : 'desc';
    const idField = this.entityPrimaryColumns[0];

    // ORDER BY with PK tie-breaker applies on every cursor request, first
    // page included — without it a defaulted first page would emit no
    // ORDER BY at all and return rows in arbitrary database order.
    out.orderBy = [{ [sort.field]: dir }, { [idField]: dir }];

    // Keyset WHERE stays confined to non-first pages — there is no prior
    // cursor position to resume from on the first page.
    if (decoded) {
      const cursorWhere = {
        OR: [
          { [sort.field]: { [op]: decoded.sortValue } },
          { AND: [{ [sort.field]: decoded.sortValue }, { [idField]: { [op]: decoded.id } }] },
        ],
      };

      // Compose with existing where (keep AUTH + soft-delete + search) — never overwrite.
      out.where = out.where ? { AND: [out.where, cursorWhere] } : cursorWhere;
    }

    return out;
  }

  /**
   * SQLi invariant: dotted-path sort fields MUST round-trip through
   * `joinResolver.getAllowedColumnsFor(relation)` before reaching Prisma's orderBy.
   * Single-segment fields assert against `entityColumns`.
   */
  private compileSort(s: { field: string; order: string }): Record<string, any> {
    const order = s.order.toLowerCase() === 'desc' ? 'desc' : 'asc';

    if (s.field.includes('.')) {
      const [relation, ...rest] = s.field.split('.');
      const allowed = this.joinResolver.getAllowedColumnsFor(relation);

      // Empty allowlist = unknown relation (defense-in-depth: size === 0)
      if (!allowed.size) {
        this.onBadRequest(`Unknown relation: ${relation}`);
      }

      const tail = rest.join('.');

      if (!allowed.has(tail)) {
        this.onBadRequest(`Unknown column: ${s.field}`);
      }

      // Build nested orderBy: { company: { name: 'asc' } }
      let cursor: any = order;
      for (let i = rest.length - 1; i >= 0; i--) {
        cursor = { [rest[i]]: cursor };
      }

      return { [relation]: cursor };
    }

    if (!this.entityColumns.includes(s.field)) {
      this.onBadRequest(`Unknown column: ${s.field}`);
    }

    return { [s.field]: order };
  }

  /**
   * Build a Prisma `select` object from parsed fields filtered by allowed columns.
   * Prisma's `select` and `include` are mutually exclusive at the same level.
   * If both select fields and include relations are requested, prefer
   * `select` and merge include relations as `{ [relation]: true }` entries.
   */
  private getSelectObject(parsed: ParsedRequestParams, options: CrudRequestOptions): Record<string, true> | undefined {
    const queryOptions = options?.query ?? {};
    const allowed = getAllowedColumns(this.entityColumns, queryOptions);

    if (!parsed.fields?.length) {
      return undefined;
    }

    const columns = parsed.fields.filter((field) => allowed.some((col) => field === col));
    const allCols = new Set([
      ...(queryOptions.persist?.length ? queryOptions.persist : []),
      ...columns,
      ...this.entityPrimaryColumns,
    ]);

    if (!allCols.size) return undefined;

    return Object.fromEntries(Array.from(allCols).map((col) => [col, true]));
  }

  /**
   * Build a Prisma `include` object for eager/requested joins.
   *
   * L3: include does NOT auto-inject deletedAt filter (consumer opt-in only).
   * L2: to-one filtered include is NEVER emitted — consumer routes filters
   *     to parent where via SCondition dotted-path (handled by WhereBuilder).
   *
   * // TODO: to-many filtered include support (future work)
   */
  private getIncludeObject(parsed: ParsedRequestParams, options: CrudRequestOptions): Record<string, any> | undefined {
    const queryOptions = options?.query ?? {};
    const joinOptions: JoinOptions = (queryOptions as any).join ?? {};
    const include: Record<string, any> = {};

    // Eager joins from options.query.join
    for (const [field, opts] of Object.entries(joinOptions)) {
      if (this.relationFields.includes(field)) {
        // L3: emit true only — no auto-deletedAt injection
        // L2: to-one filtered include NEVER emitted; to-many filter is future work
        // TODO: to-many filtered include support
        include[field] = true;
      } else if (opts) {
        // Field declared in joinOptions but not in known relationFields — skip
      }
    }

    // Client-requested joins from parsed.join
    if (parsed.join?.length) {
      for (const join of parsed.join) {
        if (this.relationFields.includes(join.field) && !(join.field in include)) {
          // L3: emit true only
          include[join.field] = true;
        }
      }
    }

    return Object.keys(include).length ? include : undefined;
  }
}
