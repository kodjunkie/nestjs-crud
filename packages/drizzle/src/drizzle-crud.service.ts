import {
  CrudService,
  CrudRequest,
  CreateManyDto,
  DEFAULT_SQL_INJECTION_REGEX,
  GetManyDefaultResponse,
  InputSanitizer,
  QueryOptions,
  JoinOptions,
  JoinOption,
} from '@nestjs-crud/core';
import { NotFoundException } from '@nestjs/common';
import { ParsedRequestParams, QueryJoin, SCondition, ComparisonOperator } from '@nestjs-crud/request';
import { hasLength, isArrayFull, isNil, isObject, objKeys, isNull } from '@nestjs-crud/util';
import {
  Table,
  Column,
  SQL,
  and,
  or,
  eq,
  isNull as drizzleIsNull,
  sql,
  getTableColumns,
  getTableName,
} from 'drizzle-orm';
import { DrizzleRelationsConfig, DrizzleAllowedRelation } from './interfaces';
import { mapOperator } from './operators';

export class DrizzleCrudService<T extends Record<string, unknown>> extends CrudService<T> {
  protected dbDialect: string;

  protected entityColumns: string[];

  protected entityPrimaryColumns: string[];

  protected entityHasDeleteColumn = false;

  protected softDeleteColumn: Column | null = null;

  protected columnsMap: Record<string, Column>;

  protected relationsHash: Map<string, DrizzleAllowedRelation> = new Map();

  protected readonly sanitizer: InputSanitizer;

  /**
   * @deprecated Since v1.0.2. The `db` constructor parameter is typed `any`
   * in v1.x. In v2.0 it will require a typed Drizzle database client
   * (see v2 TYPES-01). Consumer subclasses that rely on the `any`
   * permissiveness will need to migrate.
   *
   * Migration guide:
   * {@link https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration}
   */
  constructor(
    protected db: any,
    protected table: Table,
    protected relationsConfig: DrizzleRelationsConfig = {},
  ) {
    super();
    this.onInitMapEntityColumns();
    this.detectDialect();

    const strictMode = this.resolveStrictSanitization();
    this.sanitizer = new InputSanitizer({
      allowedColumns: new Set(this.entityColumns),
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
      strictMode,
      denylistRegex: DEFAULT_SQL_INJECTION_REGEX,
    });
    /* istanbul ignore if */
    if (!strictMode && process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.warn(
        `[nestjs-crud] strictSanitization: false — running v1 denylist behavior for ${this.constructor.name}. ` +
          `This flag will be removed in v3. See https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration`,
      );
    }
  }

  // === PUBLIC METHODS (stubs for CRUD - will be implemented in Tasks 7-10) ===

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    const { parsed, options } = req;
    const selectMap = this.getSelect(parsed, options.query);
    const query = this.db.select(selectMap).from(this.table).$dynamic();

    const searchWhere = this.buildSearchCondition(parsed.search);
    const softDeleteWhere =
      options.query.softDelete && this.entityHasDeleteColumn && parsed.includeDeleted !== 1
        ? this.getSoftDeleteCondition()
        : undefined;

    const allConditions = [searchWhere, softDeleteWhere].filter(Boolean) as SQL[];
    if (allConditions.length) {
      query.where(allConditions.length === 1 ? allConditions[0] : and(...allConditions));
    }

    this.applyJoins(query, parsed.join, options.query.join || {});

    const sortClauses = this.getSort(parsed, options.query);
    if (sortClauses.length) {
      query.orderBy(...sortClauses);
    }

    if (this.decidePagination(parsed, options)) {
      const take = this.getTake(parsed, options.query);
      const skip = this.getSkip(parsed, take);

      const countQuery = this.db
        .select({ count: sql<number>`count(*)` })
        .from(this.table)
        .$dynamic();
      if (allConditions.length) {
        countQuery.where(allConditions.length === 1 ? allConditions[0] : and(...allConditions));
      }
      const countResult = await countQuery;
      const total = Number(countResult[0]?.count ?? 0);

      if (take && isFinite(take)) {
        query.limit(take);
      }
      if (skip && isFinite(skip)) {
        query.offset(skip);
      }

      const data = (await query) as T[];
      return this.createPageInfo(data, total, take || total, skip || 0);
    }

    const take = this.getTake(parsed, options.query);
    if (take && isFinite(take)) {
      query.limit(take);
    }
    const skip = this.getSkip(parsed, take);
    if (skip && isFinite(skip)) {
      query.offset(skip);
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

    const result = await this.db.insert(this.table).values(entity).returning();
    const saved = (result[0] || entity) as T;

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

    const results = await this.db.transaction(async (tx: any) => {
      const inserted: T[] = [];
      for (let i = 0; i < bulk.length; i += 50) {
        const chunk = bulk.slice(i, i + 50);
        const result = await tx.insert(this.table).values(chunk).returning();
        inserted.push(...(result as T[]));
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
    const result = await this.db.update(this.table).set(toSave).where(pkCondition).returning();
    const updated = (result[0] || toSave) as T;

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
      const result = await this.db.update(this.table).set(toSave).where(pkCondition).returning();
      toReturn = (result[0] || toSave) as T;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
      const entity = !allowParamsOverride
        ? { ...dto, ...paramsFilters, ...parsed.authPersist }
        : { ...dto, ...parsed.authPersist };

      const result = await this.db.insert(this.table).values(entity).returning();
      toReturn = (result[0] || entity) as T;
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

  // === PROTECTED METHODS ===

  protected get tableName(): string {
    return getTableName(this.table);
  }

  protected onInitMapEntityColumns() {
    const columns = getTableColumns(this.table);
    this.columnsMap = columns as Record<string, Column>;
    this.entityColumns = Object.keys(columns);
    this.entityPrimaryColumns = [];

    // Check individual column's primary flag (handles both .primary and .primaryKey)
    for (const [name, col] of Object.entries(columns)) {
      if ((col as any).primary || (col as any).primaryKey) {
        if (!this.entityPrimaryColumns.includes(name)) {
          this.entityPrimaryColumns.push(name);
        }
      }
    }

    // Detect soft delete column (convention: deletedAt or deleted_at)
    for (const [name] of Object.entries(columns)) {
      const colName = name.toLowerCase();
      if (colName === 'deletedat' || colName === 'deleted_at') {
        this.entityHasDeleteColumn = true;
        this.softDeleteColumn = columns[name] as Column;
        break;
      }
    }
  }

  protected getColumn(field: string): Column | undefined {
    return this.columnsMap[field];
  }

  protected getSelect(query: ParsedRequestParams, options: QueryOptions): Record<string, Column> {
    const allowed = this.getAllowedColumns(this.entityColumns, options);
    const columns =
      query.fields && query.fields.length
        ? query.fields.filter((field) => allowed.some((col) => field === col))
        : allowed;

    const allCols = new Set([
      ...(options.persist && options.persist.length ? options.persist : []),
      ...columns,
      ...this.entityPrimaryColumns,
    ]);

    const selectMap: Record<string, Column> = {};
    for (const col of allCols) {
      if (this.columnsMap[col]) {
        selectMap[col] = this.columnsMap[col];
      }
    }
    return selectMap;
  }

  protected getSort(query: ParsedRequestParams, options: QueryOptions): SQL[] {
    const sorts =
      query.sort && query.sort.length ? query.sort : options.sort && options.sort.length ? options.sort : [];

    return sorts
      .map((s) => {
        const col = this.getColumn(s.field);
        if (!col) return null;
        this.sanitizer.assert(s.field);
        return s.order === 'DESC' ? sql`${col} DESC` : sql`${col} ASC`;
      })
      .filter(Boolean) as SQL[];
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
      : this.getSelect(parsed, options.query);

    const query = this.db.select(selectMap).from(this.table).$dynamic();

    const searchWhere = this.buildSearchCondition(parsed.search);
    const softDeleteWhere =
      !withDeleted && options.query.softDelete && this.entityHasDeleteColumn && parsed.includeDeleted !== 1
        ? this.getSoftDeleteCondition()
        : undefined;

    const allConditions = [searchWhere, softDeleteWhere].filter(Boolean) as SQL[];
    if (allConditions.length) {
      query.where(allConditions.length === 1 ? allConditions[0] : and(...allConditions));
    }

    if (!shallow) {
      this.applyJoins(query, parsed.join, options.query.join || {});
    }

    query.limit(1);

    const results = (await query) as T[];
    const found = results[0];

    if (!found) {
      this.throwNotFoundException(this.tableName);
    }

    return found;
  }

  /**
   * Build a Drizzle WHERE condition from an SCondition search tree.
   */
  protected buildSearchCondition(search: SCondition): SQL | undefined {
    if (!isObject(search)) return undefined;
    const keys = objKeys(search);
    if (!keys.length) return undefined;

    // Handle $and
    if (isArrayFull((search as any).$and)) {
      const conditions = (search as any).$and
        .map((item: SCondition) => this.buildSearchCondition(item))
        .filter(Boolean) as SQL[];
      return conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined;
    }

    // Handle $or
    if (isArrayFull((search as any).$or)) {
      const orConditions = (search as any).$or
        .map((item: SCondition) => this.buildSearchCondition(item))
        .filter(Boolean) as SQL[];

      const otherKeys = keys.filter((k) => k !== '$or');
      if (otherKeys.length === 0) {
        return orConditions.length === 1 ? orConditions[0] : orConditions.length > 1 ? or(...orConditions) : undefined;
      }

      // Mixed: $or with other fields
      const fieldConditions = otherKeys
        .map((field) => this.buildFieldCondition(field, (search as any)[field]))
        .filter(Boolean) as SQL[];

      const orPart = orConditions.length === 1 ? orConditions[0] : or(...orConditions);
      return and(...fieldConditions, orPart);
    }

    // Handle plain fields
    if (keys.length === 1) {
      return this.buildFieldCondition(keys[0], (search as any)[keys[0]]);
    }

    const conditions = keys
      .map((field) => this.buildFieldCondition(field, (search as any)[field]))
      .filter(Boolean) as SQL[];
    return conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined;
  }

  /**
   * Build a condition for a single field.
   */
  protected buildFieldCondition(field: string, value: any): SQL | undefined {
    const col = this.getColumn(field);
    if (!col) return undefined;
    this.sanitizer.assert(field);

    if (!isObject(value)) {
      return isNull(value) ? drizzleIsNull(col) : eq(col, value);
    }

    const operators = objKeys(value);
    if (operators.length === 1) {
      const op = operators[0];
      if (op === '$or' && isObject(value.$or)) {
        return this.buildFieldOperatorOr(col, value.$or);
      }
      return mapOperator(col, op as ComparisonOperator, value[op], this.dbDialect);
    }

    const conditions = operators
      .map((op) => {
        if (op === '$or' && isObject(value.$or)) {
          return this.buildFieldOperatorOr(col, value.$or);
        }
        return mapOperator(col, op as ComparisonOperator, value[op], this.dbDialect);
      })
      .filter(Boolean) as SQL[];

    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  protected getSoftDeleteCondition(): SQL | undefined {
    if (this.entityHasDeleteColumn && this.softDeleteColumn) {
      return drizzleIsNull(this.softDeleteColumn);
    }
    return undefined;
  }

  protected buildPrimaryKeyCondition(entity: T): SQL {
    const conditions = this.entityPrimaryColumns.map((pkField) => {
      const col = this.getColumn(pkField);
      if (!col) {
        this.throwBadRequestException(`Primary key column ${pkField} not found`);
      }
      return eq(col!, (entity as any)[pkField]);
    });
    return conditions.length === 1 ? conditions[0] : and(...conditions)!;
  }

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

  protected applyJoins(query: any, parsedJoins: QueryJoin[], joinOptions: JoinOptions) {
    if (!joinOptions) return;
    const allowedJoins = objKeys(joinOptions);
    if (!hasLength(allowedJoins)) return;

    const appliedJoins = new Set<string>();

    // Apply eager joins first
    for (const joinField of allowedJoins) {
      const options = joinOptions[joinField];
      if (options.eager) {
        this.applyJoin(query, joinField, options);
        appliedJoins.add(joinField);
      }
    }

    // Apply requested joins
    if (isArrayFull(parsedJoins)) {
      for (const join of parsedJoins) {
        if (!appliedJoins.has(join.field) && allowedJoins.includes(join.field)) {
          this.applyJoin(query, join.field, joinOptions[join.field]);
        }
      }
    }
  }

  protected getSoftDeleteColumnName(): string {
    for (const [name, col] of Object.entries(this.columnsMap)) {
      if (col === this.softDeleteColumn) {
        return name;
      }
    }
    return 'deletedAt';
  }

  // === PRIVATE METHODS ===

  private detectDialect() {
    const dialect = (this.db as any).dialect;
    if (dialect && typeof dialect === 'object' && 'name' in dialect) {
      this.dbDialect = dialect.name;
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

  private applyJoin(query: any, field: string, options: JoinOption) {
    const relationConfig = this.relationsConfig[field];
    if (!relationConfig) return;
    const joinFn = options.required ? 'innerJoin' : 'leftJoin';
    query[joinFn](relationConfig.table, eq(relationConfig.referenceKey, relationConfig.foreignKey));
  }

  private buildFieldOperatorOr(col: Column, orObj: any): SQL | undefined {
    const orKeys = objKeys(orObj);
    if (orKeys.length === 1) {
      return mapOperator(col, orKeys[0] as ComparisonOperator, orObj[orKeys[0]], this.dbDialect);
    }
    const conditions = orKeys
      .map((op) => mapOperator(col, op as ComparisonOperator, orObj[op], this.dbDialect))
      .filter(Boolean) as SQL[];
    return conditions.length > 1 ? or(...conditions) : conditions[0];
  }

}
