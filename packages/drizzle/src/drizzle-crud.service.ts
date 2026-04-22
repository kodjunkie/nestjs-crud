import { CrudService, CrudRequest, CreateManyDto, GetManyDefaultResponse } from '@nestjs-crud/core';
import { NotFoundException } from '@nestjs/common';
import { hasLength, isArrayFull, isNil, isObject, objKeys } from '@nestjs-crud/util';
import { Table, Column, SQL, and, eq, sql, getTableColumns, getTableName } from 'drizzle-orm';

import { DrizzleJoinResolver } from './drizzle-join-resolver';
import { DrizzleQueryTranslator } from './drizzle-query-translator';
import { DrizzleRelationsConfig } from './interfaces';
import { DrizzleClient } from './interfaces/drizzle-client.interface';

export class DrizzleCrudService<T extends Record<string, unknown>> extends CrudService<T> {
  protected dbDialect: string;

  protected entityColumns: string[];

  protected entityPrimaryColumns: string[];

  protected entityHasDeleteColumn = false;

  protected softDeleteColumn: Column | null = null;

  protected columnsMap: Record<string, Column>;

  protected readonly translator: DrizzleQueryTranslator<T>;

  protected readonly joinResolver: DrizzleJoinResolver;

  constructor(
    protected db: DrizzleClient,
    protected table: Table,
    protected relationsConfig: DrizzleRelationsConfig = {},
  ) {
    super();
    this.onInitMapEntityColumns();
    this.detectDialect();

    this.joinResolver = new DrizzleJoinResolver({
      relationsConfig: this.relationsConfig,
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
    });
    this.translator = new DrizzleQueryTranslator<T>(this.db, this.table, {
      entityColumns: this.entityColumns,
      entityPrimaryColumns: this.entityPrimaryColumns,
      columnsMap: this.columnsMap,
      entityHasDeleteColumn: this.entityHasDeleteColumn,
      softDeleteColumn: this.softDeleteColumn,
      dbDialect: this.dbDialect,
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
      joinResolver: this.joinResolver,
    });
  }

  // === PUBLIC CRUD VERBS ===

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    const { parsed, options } = req;
    const selectMap = this.translator.getSelect(parsed, options.query);
    const query = this.db.select(selectMap).from(this.table).$dynamic();

    this.translator.applyToQuery(query, parsed, options);

    if (this.decidePagination(parsed, options)) {
      const take = this.getTake(parsed, options.query);
      const skip = this.getSkip(parsed, take as number);
      const total = await this.translator.count(query);
      const data = (await query) as T[];
      return this.createPageInfo(data, total, take || total, skip || 0);
    }

    return (await query) as T[];
  }

  public async getOne(req: CrudRequest): Promise<T> {
    return this.getOneOrFail(req);
  }

  public async createOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { parsed, options } = req;
    const entity = this.prepareEntityBeforeSave(dto, parsed);

    if (!entity) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const saved = await this.insertReturning(entity);

    if (options.routes.createOneBase.returnShallow) {
      return saved;
    }

    const primaryParams = this.getPrimaryParams(options);
    if (primaryParams.length && primaryParams.every((p) => !isNil(saved[p]))) {
      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: saved[p] }), {});
      return this.getOneOrFail(req);
    }

    return saved;
  }

  public async createMany(req: CrudRequest, dto: CreateManyDto): Promise<T[]> {
    if (!isObject(dto) || !isArrayFull(dto.bulk)) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const bulk = dto.bulk
      .map((one) => this.prepareEntityBeforeSave(one as T | Partial<T>, req.parsed))
      .filter((d) => !isNil(d));

    if (!hasLength(bulk)) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const results = await this.db.transaction(async (tx: DrizzleClient) => {
      const inserted: T[] = [];
      for (let i = 0; i < bulk.length; i += 50) {
        const chunk = bulk.slice(i, i + 50);
        if (this.dbDialect === 'mysql') {
          // MySQL does not support RETURNING — insert chunk and collect as plain objects
          await tx.insert(this.table).values(chunk);
          inserted.push(...(chunk as T[]));
        } else {
          const result = await tx.insert(this.table).values(chunk).returning();
          inserted.push(...(result as T[]));
        }
      }
      return inserted;
    });

    return results;
  }

  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { parsed, options } = req;
    const { allowParamsOverride, returnShallow } = options.routes.updateOneBase;
    const paramsFilters = this.getParamFilters(parsed);
    const found = await this.getOneOrFail(req, returnShallow);

    const toSave = !allowParamsOverride
      ? { ...found, ...dto, ...paramsFilters, ...parsed.authPersist }
      : { ...found, ...dto, ...parsed.authPersist };

    const pkCondition = this.buildPrimaryKeyCondition(found);
    const updated = await this.updateReturning(toSave, pkCondition);

    if (returnShallow) {
      return updated;
    }

    const primaryParams = this.getPrimaryParams(options);
    if (primaryParams.length) {
      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: (updated as any)[p] }), {});
    }
    return this.getOneOrFail(req);
  }

  public async replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { parsed, options } = req;
    const { allowParamsOverride, returnShallow } = options.routes.replaceOneBase;
    const paramsFilters = this.getParamFilters(parsed);

    let toReturn: T;
    try {
      const found = await this.getOneOrFail(req, returnShallow);
      const toSave = !allowParamsOverride
        ? { ...found, ...dto, ...paramsFilters, ...parsed.authPersist }
        : { ...found, ...dto, ...parsed.authPersist };

      const pkCondition = this.buildPrimaryKeyCondition(found);
      toReturn = await this.updateReturning(toSave, pkCondition);
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
      const entity = !allowParamsOverride
        ? { ...dto, ...paramsFilters, ...parsed.authPersist }
        : { ...dto, ...parsed.authPersist };

      toReturn = await this.insertReturning(entity);
    }

    if (returnShallow) {
      return toReturn;
    }

    const primaryParams = this.getPrimaryParams(options);
    if (primaryParams.length) {
      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: (toReturn as any)[p] }), {});
    }
    return this.getOneOrFail(req);
  }

  public async deleteOne(req: CrudRequest): Promise<void | T> {
    const { options } = req;
    const { returnDeleted } = options.routes.deleteOneBase;
    const found = await this.getOneOrFail(req, true);
    const toReturn = returnDeleted ? ({ ...found } as T) : undefined;

    const pkCondition = this.buildPrimaryKeyCondition(found);

    if (options.query.softDelete && this.entityHasDeleteColumn && this.softDeleteColumn) {
      await this.db
        .update(this.table)
        .set({ [this.getSoftDeleteColumnName()]: this.dbDialect === 'sqlite' ? sql`datetime('now')` : sql`NOW()` })
        .where(pkCondition);
    } else {
      await this.db.delete(this.table).where(pkCondition);
    }

    return toReturn;
  }

  public async recoverOne(req: CrudRequest): Promise<void | T> {
    if (!this.entityHasDeleteColumn || !this.softDeleteColumn) {
      this.throwBadRequestException('Soft delete is not enabled for this entity');
    }

    const found = await this.getOneOrFail(req, false, true);
    const pkCondition = this.buildPrimaryKeyCondition(found);

    await this.db
      .update(this.table)
      .set({ [this.getSoftDeleteColumnName()]: null })
      .where(pkCondition);

    req.parsed.search = this.entityPrimaryColumns.reduce((acc, p) => ({ ...acc, [p]: (found as any)[p] }), {});
    return this.getOneOrFail(req);
  }

  // === PROTECTED HELPERS ===

  protected get tableName(): string {
    return getTableName(this.table);
  }

  protected onInitMapEntityColumns() {
    const columns = getTableColumns(this.table);
    this.columnsMap = columns as Record<string, Column>;
    this.entityColumns = Object.keys(columns);
    this.entityPrimaryColumns = [];

    for (const [name, col] of Object.entries(columns)) {
      if ((col as any).primary || (col as any).primaryKey) {
        if (!this.entityPrimaryColumns.includes(name)) {
          this.entityPrimaryColumns.push(name);
        }
      }
    }

    for (const [name] of Object.entries(columns)) {
      const colName = name.toLowerCase();
      if (colName === 'deletedat' || colName === 'deleted_at') {
        this.entityHasDeleteColumn = true;
        this.softDeleteColumn = columns[name] as Column;
        break;
      }
    }
  }

  protected getParamFilters(parsed: CrudRequest['parsed']): Record<string, any> {
    const filters: Record<string, any> = {};
    if (hasLength(parsed.paramsFilter)) {
      for (const filter of parsed.paramsFilter) {
        filters[filter.field] = filter.value;
      }
    }
    return filters;
  }

  protected async getOneOrFail(req: CrudRequest, shallow = false, withDeleted = false): Promise<T> {
    const { parsed, options } = req;
    const selectMap = shallow
      ? (Object.fromEntries(this.entityColumns.map((c) => [c, this.columnsMap[c]])) as Record<string, Column>)
      : this.translator.getSelect(parsed, options.query);

    const query = this.db.select(selectMap).from(this.table).$dynamic();

    const searchWhere = this.translator.buildWhere(parsed.search);
    const softDeleteWhere =
      !withDeleted && options.query.softDelete && this.entityHasDeleteColumn && parsed.includeDeleted !== 1
        ? this.translator.getSoftDeleteCondition()
        : undefined;

    const allConditions = [searchWhere, softDeleteWhere].filter(Boolean) as SQL[];
    if (allConditions.length) {
      query.where(allConditions.length === 1 ? allConditions[0] : and(...allConditions));
    }

    if (!shallow) {
      this.joinResolver.applyJoins(query, parsed.join || [], options.query.join || {});
    }

    query.limit(1);

    const results = (await query) as T[];
    const found = results[0];

    if (!found) {
      this.throwNotFoundException(this.tableName);
    }

    return found;
  }

  protected buildPrimaryKeyCondition(entity: T): SQL {
    const conditions = this.entityPrimaryColumns.map((pkField) => {
      const col = this.columnsMap[pkField];
      if (!col) {
        this.throwBadRequestException(`Primary key column ${pkField} not found`);
      }
      return eq(col!, (entity as any)[pkField]);
    });
    return conditions.length === 1 ? conditions[0] : and(...conditions)!;
  }

  /**
   * Normalise a DTO ahead of insert/update. Drizzle adapter keeps a local
   * implementation rather than delegating to `@nestjs-crud/core`'s
   * `prepareEntityBeforeSave` util: the core util is class-aware and applies
   * `plainToClass(entityType, ...)`, but Drizzle has no entity class — it
   * operates on plain row objects. The local version preserves
   * `paramsFilter` + `authPersist` semantics without class-transformer.
   * Forward-flag (TYPES-01): a typed Drizzle client in v2.1 may enable a
   * class-less core util variant that this adapter can delegate to.
   */
  protected prepareEntityBeforeSave(
    dto: T | Partial<T>,
    parsed: CrudRequest['parsed'],
  ): Record<string, any> | undefined {
    if (!isObject(dto)) {
      return undefined;
    }
    const entity = { ...dto } as Record<string, any>;

    if (hasLength(parsed.paramsFilter)) {
      for (const filter of parsed.paramsFilter) {
        entity[filter.field] = filter.value;
      }
    }

    if (parsed.authPersist) {
      Object.assign(entity, parsed.authPersist);
    }

    if (!hasLength(objKeys(entity))) {
      return undefined;
    }
    return entity;
  }

  protected getSoftDeleteColumnName(): string {
    for (const [name, col] of Object.entries(this.columnsMap)) {
      if (col === this.softDeleteColumn) {
        return name;
      }
    }
    return 'deletedAt';
  }

  /**
   * Insert a row and return the saved entity.
   * MySQL does not support RETURNING — we use the OkPacket insertId to inject
   * the auto-generated PK back into the entity so callers can do a re-fetch.
   * Postgres and SQLite use RETURNING for an exact round-trip.
   */
  protected async insertReturning(entity: Record<string, any>): Promise<T> {
    if (this.dbDialect === 'mysql') {
      const [result] = await this.db.insert(this.table).values(entity);
      const pkField = this.entityPrimaryColumns[0];
      const insertedId = (result as any)?.insertId;
      const saved = { ...entity } as Record<string, any>;
      if (pkField && insertedId != null) {
        saved[pkField] = insertedId;
      }
      return saved as T;
    }
    const result = await this.db.insert(this.table).values(entity).returning();
    return (result[0] || entity) as T;
  }

  /**
   * Update rows matching `condition` and return the updated entity.
   * MySQL does not support RETURNING — fall back to the `toSave` object.
   * Callers that need a fresh round-trip should call getOneOrFail afterward.
   */
  protected async updateReturning(toSave: Record<string, any>, condition: SQL): Promise<T> {
    if (this.dbDialect === 'mysql') {
      await this.db.update(this.table).set(toSave).where(condition);
      return toSave as T;
    }
    const result = await this.db.update(this.table).set(toSave).where(condition).returning();
    return (result[0] || toSave) as T;
  }

  // === PRIVATE HELPERS ===

  private detectDialect() {
    const dialect = this.db.dialect;
    if (dialect && typeof dialect === 'object' && 'name' in (dialect as object)) {
      this.dbDialect = (dialect as Record<string, unknown>).name as string;
    } else if (this.db.constructor?.name?.toLowerCase().includes('pg')) {
      this.dbDialect = 'pg';
    } else if (this.db.constructor?.name?.toLowerCase().includes('mysql')) {
      this.dbDialect = 'mysql';
    } else if (
      this.db.constructor?.name?.toLowerCase().includes('sqlite') ||
      this.db.constructor?.name?.toLowerCase().includes('libsql')
    ) {
      this.dbDialect = 'sqlite';
    } else {
      this.dbDialect = 'pg';
    }
  }
}
