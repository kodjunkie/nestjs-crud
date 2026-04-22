import { getAllowedColumns, JoinOption, JoinOptions, JoinResolver } from '@nestjs-crud/core';
import { QueryJoin } from '@nestjs-crud/request';
import { hasLength, isArrayFull, objKeys } from '@nestjs-crud/util';

import { MikroOrmAllowedRelation, MikroOrmJoinResolverConfig } from './interfaces';

/**
 * Resolves eager + client-requested joins for the MikroORM CRUD adapter.
 * Ports the inline `applyJoins` / relations-hash logic from
 * `MikroOrmCrudService` (v1.x) and exposes `getAllowedColumnsFor` for
 * dotted-path sort allowlist enforcement (D-05b SQLi-guard invariant —
 * Phase 5 Plan 06.5 pattern).
 *
 * The resolver does NOT import from `mikro-orm-crud.service.ts` — entity
 * metadata flows in via the ctor (arch-avoid-circular-deps invariant).
 *
 * MikroORM's QB surface is typed `any` here (TYPES-04 debt — tightened in
 * Phase 8). The resolver implements `JoinResolver<any>`.
 *
 * @since 2.0.0
 */
export class MikroOrmJoinResolver implements JoinResolver<any> {
  private readonly metadata: any;

  private readonly onBadRequest: (msg: string) => void;

  private readonly relationsHash: Map<string, MikroOrmAllowedRelation> = new Map();

  constructor(config: MikroOrmJoinResolverConfig) {
    this.metadata = config.metadata;
    this.onBadRequest = config.onBadRequest;
    this.buildRelationsHash();
  }

  public applyJoins(query: any, joins: QueryJoin[], joinOptions: JoinOptions): any {
    if (!joinOptions) return query;

    const allowedJoins = objKeys(joinOptions);
    if (!hasLength(allowedJoins)) return query;

    const appliedJoins = new Set<string>();

    for (const joinField of allowedJoins) {
      const options = joinOptions[joinField];
      /* istanbul ignore else */
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
   * D-05b SQLi mitigation surface.
   *
   * @since 2.0.0
   */
  public getAllowedColumnsFor(field: string): ReadonlySet<string> {
    const rel = this.relationsHash.get(field) ?? this.relationsHash.get(field.split('.')[0]);
    return new Set(rel?.allowedColumns ?? []);
  }

  private applyJoin(query: any, field: string, options: JoinOption): void {
    const allowed = this.relationsHash.get(field);
    if (!allowed) {
      return;
    }

    if (typeof query.leftJoinAndSelect === 'function' && options.select !== false) {
      const joinFn = options.required ? 'joinAndSelect' : 'leftJoinAndSelect';
      const alias = options.alias || allowed.name;
      query[joinFn](allowed.path, alias);
    } else if (typeof query.populate === 'function') {
      query.populate([field]);
    }
  }

  private buildRelationsHash(): void {
    const meta = this.metadata as any;
    const relations: Record<string, any> = (meta && meta.relations) || {};
    const propsSource: Record<string, any> = (meta && meta.properties) || {};

    // MikroORM exposes relations either as a keyed record or an array of
    // EntityProperty objects. Normalise to a name -> prop map.
    const relEntries: Array<[string, any]> = Array.isArray(relations)
      ? relations.map((r: any) => [r.name, r])
      : Object.entries(relations).length
        ? Object.entries(relations)
        : Object.entries(propsSource).filter(([, p]: [string, any]) => p && typeof p.kind === 'string');

    for (const [name, prop] of relEntries) {
      const targetMeta = (prop && (prop.targetMeta || prop.entity)) || null;
      const targetProps: Record<string, any> = (targetMeta && targetMeta.properties) || {};

      const columns: string[] = [];
      const primaryColumns: string[] = [];

      for (const [colName, colProp] of Object.entries(targetProps)) {
        if ((colProp as any).persist === false) continue;
        // MikroORM v7 sets `kind: 'scalar'` on scalar props too; only skip
        // relation kinds (m:1, 1:m, m:n, 1:1, embedded). Treat 'scalar' as a
        // regular column for allowlist purposes (D-05b dotted-path gate).
        const kind = (colProp as any).kind;
        if (kind && typeof kind === 'string' && kind !== 'scalar') continue;
        columns.push(colName);
        if ((colProp as any).primary) {
          primaryColumns.push(colName);
        }
      }

      const allowedColumns = getAllowedColumns(columns, {});
      const nested = name.includes('.');
      const leaf = nested ? name.split('.').slice(-1)[0] : name;

      const record: MikroOrmAllowedRelation = {
        name: leaf,
        path: `${meta.className || meta.name || ''}.${name}`,
        nested,
        columns,
        primaryColumns,
        allowedColumns,
        prop,
      };

      this.relationsHash.set(name, record);
      if (nested && !this.relationsHash.has(leaf)) {
        this.relationsHash.set(leaf, record);
      }
    }
  }
}
