import { getAllowedColumns, JoinOption, JoinOptions, JoinResolver } from '@nestjs-crud/core';
import { QueryJoin } from '@nestjs-crud/request';
import { isArrayFull } from '@nestjs-crud/util';
import { EntityMetadata, Repository, SelectQueryBuilder } from 'typeorm';

interface IAllowedRelation {
  alias?: string;
  nested: boolean;
  name: string;
  path: string;
  columns: string[];
  primaryColumns: string[];
  allowedColumns: string[];
}

export interface TypeOrmJoinResolverConfig {
  onBadRequest: (msg: string) => void;
}

export class TypeOrmJoinResolver<T> implements JoinResolver<SelectQueryBuilder<T>> {
  private readonly repo: Repository<T>;

  private readonly onBadRequest: (msg: string) => void;

  private readonly entityRelationsHash: Map<string, IAllowedRelation> = new Map();

  constructor(repo: Repository<T>, config: TypeOrmJoinResolverConfig) {
    this.repo = repo;
    this.onBadRequest = config.onBadRequest;
  }

  public applyJoins(
    query: SelectQueryBuilder<T>,
    joins: QueryJoin[],
    joinOptions: JoinOptions,
  ): SelectQueryBuilder<T> {
    const allowedJoins = Object.keys(joinOptions);

    if (!allowedJoins.length) {
      return query;
    }

    const eagerJoins: Record<string, boolean> = {};

    for (let i = 0; i < allowedJoins.length; i++) {
      /* istanbul ignore else */
      if (joinOptions[allowedJoins[i]].eager) {
        const cond = (joins || []).find((j) => j && j.field === allowedJoins[i]) || {
          field: allowedJoins[i],
        };
        this.setJoinInternal(cond, joinOptions, query);
        eagerJoins[allowedJoins[i]] = true;
      }
    }

    if (isArrayFull(joins)) {
      for (let i = 0; i < joins.length; i++) {
        /* istanbul ignore else */
        if (!eagerJoins[joins[i].field]) {
          this.setJoinInternal(joins[i], joinOptions, query);
        }
      }
    }

    return query;
  }

  public getAllowedColumnsFor(field: string): ReadonlySet<string> {
    const rel = this.entityRelationsHash.get(field) ?? this.entityRelationsHash.get(field.split('.')[0]);
    return new Set(rel?.allowedColumns ?? []);
  }

  private get alias(): string {
    return this.repo.metadata.targetName;
  }

  private getRelationMetadata(field: string, options: JoinOption): IAllowedRelation | null {
    try {
      let allowedRelation;
      let nested = false;

      if (this.entityRelationsHash.has(field)) {
        allowedRelation = this.entityRelationsHash.get(field);
      } else {
        const fields = field.split('.');
        let relationMetadata: EntityMetadata;
        let name: string;
        let path: string;
        let parentPath: string;

        if (fields.length === 1) {
          const found = this.repo.metadata.relations.find((one) => one.propertyName === fields[0]);

          if (found) {
            name = fields[0];
            path = `${this.alias}.${fields[0]}`;
            relationMetadata = found.inverseEntityMetadata;
          }
        } else {
          nested = true;
          parentPath = '';

          const reduced = fields.reduce(
            (res, propertyName: string, i) => {
              const found = res.relations.length
                ? res.relations.find((one) => one.propertyName === propertyName)
                : null;
              const relationMetadata = found ? found.inverseEntityMetadata : null;
              const relations = relationMetadata ? relationMetadata.relations : [];
              name = propertyName;

              if (i !== fields.length - 1) {
                parentPath = !parentPath ? propertyName : /* istanbul ignore next */ `${parentPath}.${propertyName}`;
              }

              return {
                relations,
                relationMetadata,
              };
            },
            {
              relations: this.repo.metadata.relations,
              relationMetadata: null,
            },
          );

          relationMetadata = reduced.relationMetadata;
        }

        if (relationMetadata) {
          const { columns, primaryColumns } = this.getEntityColumns(relationMetadata);

          if (!path && parentPath) {
            const parentAllowedRelation = this.entityRelationsHash.get(parentPath);

            /* istanbul ignore next */
            if (parentAllowedRelation) {
              path = parentAllowedRelation.alias ? `${parentAllowedRelation.alias}.${name}` : field;
            }
          }

          allowedRelation = {
            alias: options.alias,
            name,
            path,
            columns,
            nested,
            primaryColumns,
          };
        }
      }

      if (allowedRelation) {
        const allowedColumns = getAllowedColumns(allowedRelation.columns, options);
        const toSave: IAllowedRelation = { ...allowedRelation, allowedColumns };

        this.entityRelationsHash.set(field, toSave);

        if (options.alias) {
          this.entityRelationsHash.set(options.alias, toSave);
        }

        return toSave;
      }

      return null;
    } catch (_) {
      // TODO(COVERAGE-01): surface these errors — swallowing with null hides metadata problems
      /* istanbul ignore next */
      return null;
    }
  }

  private setJoinInternal(cond: QueryJoin, joinOptions: JoinOptions, builder: SelectQueryBuilder<T>): void {
    const options = joinOptions[cond.field];

    if (!options) {
      return;
    }

    const allowedRelation = this.getRelationMetadata(cond.field, options);

    if (!allowedRelation) {
      return;
    }

    const relationType = options.required ? 'innerJoin' : 'leftJoin';
    const alias = options.alias ? options.alias : allowedRelation.name;

    builder[relationType](allowedRelation.path, alias);

    if (options.select !== false) {
      const columns = isArrayFull(cond.select)
        ? cond.select.filter((column) => allowedRelation.allowedColumns.some((allowed) => allowed === column))
        : allowedRelation.allowedColumns;

      const select = new Set(
        [...allowedRelation.primaryColumns, ...(isArrayFull(options.persist) ? options.persist : []), ...columns].map(
          (col) => `${alias}.${col}`,
        ),
      );

      builder.addSelect(Array.from(select));
    }
  }

  private getEntityColumns(entityMetadata: EntityMetadata): { columns: string[]; primaryColumns: string[] } {
    const columns = entityMetadata.columns.map((prop) => prop.propertyPath) || /* istanbul ignore next */ [];
    const primaryColumns =
      entityMetadata.primaryColumns.map((prop) => prop.propertyPath) || /* istanbul ignore next */ [];

    return { columns, primaryColumns };
  }
}
