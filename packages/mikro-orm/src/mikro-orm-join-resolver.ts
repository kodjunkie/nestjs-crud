import { getAllowedColumns, JoinOption, JoinOptions, JoinResolver } from '@nestjs-crud/core';
import { QueryJoin } from '@nestjs-crud/request';
import { hasLength, isArrayFull, objKeys } from '@nestjs-crud/util';
import { EntityMetadata } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';

import { MikroOrmAllowedRelation, MikroOrmJoinResolverConfig } from './interfaces';

/**
 * Resolves eager + client-requested joins for the MikroORM CRUD adapter.
 * Ports the inline `applyJoins` / relations-hash logic from
 * `MikroOrmCrudService` (v1.x) and exposes `getAllowedColumnsFor` for
 * dotted-path sort allowlist enforcement (SQLi-guard invariant).
 *
 * The resolver does NOT import from `mikro-orm-crud.service.ts` — entity
 * metadata flows in via the ctor (arch-avoid-circular-deps invariant).
 *
 * MikroORM's QB surface is typed `any` here (type debt — tightened later).
 * The resolver implements `JoinResolver<any>`.
 *
 * @since 2.0.0
 */
export class MikroOrmJoinResolver implements JoinResolver<QueryBuilder<object>> {
  private readonly metadata: EntityMetadata<object>;

  private readonly onBadRequest: (msg: string) => void;

  private readonly relationsHash: Map<string, MikroOrmAllowedRelation> = new Map();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(config: MikroOrmJoinResolverConfig<any>) {
    this.metadata = config.metadata as EntityMetadata<object>;
    this.onBadRequest = config.onBadRequest;
    this.buildRelationsHash();
  }

  public applyJoins(query: QueryBuilder<object>, joins: QueryJoin[], joinOptions: JoinOptions): QueryBuilder<object> {
    if (!joinOptions) return query;

    const allowedJoins = objKeys(joinOptions);
    if (!hasLength(allowedJoins)) return query;

    const appliedJoins = new Set<string>();

    for (const joinField of allowedJoins) {
      const options = joinOptions[joinField];
      if (options.eager) {
        this.applyJoin(query, joinField, options);
        appliedJoins.add(joinField);
      }
    }

    if (isArrayFull(joins)) {
      for (const join of joins) {
        if (!appliedJoins.has(join.field) && allowedJoins.includes(join.field)) {
          this.applyJoin(query, join.field, joinOptions[join.field]);
        }
      }
    }

    return query;
  }

  /**
   * Return the allowed column name set for a given relation (or dotted
   * path). Returns an empty Set if the relation is unknown — callers must
   * check `.size` and reject before the identifier reaches the SQL builder.
   * SQLi mitigation surface.
   *
   * @since 2.0.0
   */
  public getAllowedColumnsFor(field: string): ReadonlySet<string> {
    const rel = this.relationsHash.get(field) ?? this.relationsHash.get(field.split('.')[0]);
    return new Set(rel?.allowedColumns ?? []);
  }

  private applyJoin(query: QueryBuilder<object>, field: string, options: JoinOption): void {
    const allowed = this.relationsHash.get(field);
    if (!allowed) {
      return;
    }

    // @internal — QB does not expose leftJoinAndSelect/joinAndSelect/populate in its
    // TypeScript declaration; these are runtime-only methods surfaced by @mikro-orm/knex.
    const q = query as unknown as Record<string, (...a: unknown[]) => void>;
    if (typeof q['leftJoinAndSelect'] === 'function' && options.select !== false) {
      const joinFn = options.required ? 'joinAndSelect' : 'leftJoinAndSelect';
      const alias = options.alias || allowed.name;
      q[joinFn](allowed.path, alias);
    } else if (typeof q['populate'] === 'function') {
      q['populate']([field]);
    }
  }

  private buildRelationsHash(): void {
    // @internal — EntityMetadata shape is accessed via index to handle both the
    // v7 keyed-record and legacy array forms that MikroORM emits at runtime.
    const meta = this.metadata as unknown as Record<string, unknown>;
    const relations: Record<string, unknown> = (meta && (meta['relations'] as Record<string, unknown>)) || {};
    const propsSource: Record<string, unknown> = (meta && (meta['properties'] as Record<string, unknown>)) || {};

    // MikroORM exposes relations either as a keyed record or an array of
    // EntityProperty objects. Normalise to a name -> prop map.
    const relEntries: Array<[string, unknown]> = Array.isArray(relations)
      ? (relations as unknown[]).map((r: unknown) => [(r as Record<string, unknown>)['name'] as string, r])
      : Object.entries(relations).length
        ? Object.entries(relations)
        : Object.entries(propsSource).filter(
            ([, p]) => p && typeof (p as Record<string, unknown>)['kind'] === 'string',
          );

    for (const [name, prop] of relEntries) {
      // @internal — prop shape is MikroORM-internal (EntityProperty); accessed
      // via index because the declared type does not expose targetMeta/entity.
      const p = prop as Record<string, unknown>;
      const targetMeta =
        (p && ((p['targetMeta'] as Record<string, unknown>) || (p['entity'] as Record<string, unknown>))) || null;
      const targetProps: Record<string, unknown> =
        (targetMeta && (targetMeta['properties'] as Record<string, unknown>)) || {};

      const columns: string[] = [];
      const primaryColumns: string[] = [];

      for (const [colName, colProp] of Object.entries(targetProps)) {
        const cp = colProp as Record<string, unknown>;
        if (cp['persist'] === false) continue;
        // MikroORM v7 sets `kind: 'scalar'` on scalar props too; only skip
        // relation kinds (m:1, 1:m, m:n, 1:1, embedded). Treat 'scalar' as a
        // regular column for allowlist purposes (dotted-path gate).
        const kind = cp['kind'];
        if (kind && typeof kind === 'string' && kind !== 'scalar') continue;
        columns.push(colName);
        if (cp['primary']) {
          primaryColumns.push(colName);
        }
      }

      const allowedColumns = getAllowedColumns(columns, {});
      const nested = name.includes('.');
      const leaf = nested ? name.split('.').slice(-1)[0] : name;

      const record: MikroOrmAllowedRelation = {
        name: leaf,
        path: `${(meta['className'] as string) || (meta['name'] as string) || ''}.${name}`,
        nested,
        columns,
        primaryColumns,
        allowedColumns,
        prop: prop as MikroOrmAllowedRelation['prop'],
      };

      this.relationsHash.set(name, record);
      if (nested && !this.relationsHash.has(leaf)) {
        this.relationsHash.set(leaf, record);
      }
    }
  }
}
