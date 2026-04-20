import { CrudService, CrudRequest, CreateManyDto, GetManyDefaultResponse, QueryOptions } from '@nestjs-crud/core';
import { NotFoundException } from '@nestjs/common';
import { ParsedRequestParams, SCondition, ComparisonOperator } from '@nestjs-crud/request';
import { hasLength, isArrayFull, isNil, isObject, objKeys, isNull } from '@nestjs-crud/util';
import { EntityManager, EntityClass, EntityProperty } from '@mikro-orm/core';
import { MikroOrmAllowedRelation, DbDialect } from './interfaces';
import { mapOperator } from './operators';

/**
 * @deprecated Since v1.0.2. Public method signatures and internal
 * `any` surfaces on `MikroOrmCrudService` will tighten in v2.0
 * (see v2 TYPES-02). Consumer subclasses that rely on `any`
 * permissiveness — especially those that access or override
 * `protected metadata` / `protected propertiesMap` — will need
 * to migrate to the typed equivalents shipped with v2.
 *
 * No runtime change in v1.0.2; this notice exists to give
 * consumers months of lead time before v2.
 *
 * Migration guide:
 * {@link https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration}
 */
export class MikroOrmCrudService<T extends object> extends CrudService<T> {
  protected dbDialect: DbDialect;

  /**
   * @deprecated Since v1.0.2. `metadata` is typed `any` and will
   * become a typed EntityMetadata reference in v2.0 (v2 TYPES-02).
   * {@link https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration}
   */
  protected metadata: any;

  protected entityColumns: string[];

  protected entityPrimaryColumns: string[];

  protected entityHasDeleteColumn = false;

  protected softDeleteColumn: string | null = null;

  protected propertiesMap: Record<string, EntityProperty>;

  protected relationsHash: Map<string, MikroOrmAllowedRelation> = new Map();

  // Denylist regexes use /i only. Parity verified against packages/drizzle/src/drizzle-crud.service.ts (QUALITY-03, Phase 1 of v1.0.2).
  protected sqlInjectionRegEx: RegExp[] = [
    /(%27)|(\')|(--)|(%23)|(#)/i,
    /((%3D)|(=))[^\n]*((%27)|(\')|(--)|(%3B)|(;))/i,
    /w*((%27)|(\'))((%6F)|o|(%4F))((%72)|r|(%52))/i,
    /((%27)|(\'))union/i,
  ];

  constructor(
    protected em: EntityManager,
    protected entityClass: EntityClass<T>,
  ) {
    super();
    this.metadata = this.em.getMetadata().get(this.entityClass.name);
    this.onInitMapEntityColumns();
    this.detectDialect();
  }

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    const { parsed, options } = req;
    const where = this.buildWhereCondition(parsed, options);
    const fields = this.getSelect(parsed, options.query);
    const orderBy = this.getSort(parsed, options.query);

    if (this.decidePagination(parsed, options)) {
      const take = this.getTake(parsed, options.query);
      const skip = this.getSkip(parsed, take);

      const [data, total] = await this.em.findAndCount(this.entityClass, where as any, {
        fields: fields as any,
        orderBy: orderBy as any,
        limit: take && isFinite(take) ? take : undefined,
        offset: skip && isFinite(skip) ? skip : undefined,
      });

      return this.createPageInfo(data as unknown as T[], total, take || total, skip || 0);
    }

    const take = this.getTake(parsed, options.query);
    const skip = this.getSkip(parsed, take);

    const data = await this.em.find(this.entityClass, where as any, {
      fields: fields as any,
      orderBy: orderBy as any,
      limit: take && isFinite(take) ? take : undefined,
      offset: skip && isFinite(skip) ? skip : undefined,
    });

    return data as unknown as T[];
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

    const created = this.em.create(this.entityClass, entity as any);
    await this.em.flush();

    if (options.routes.createOneBase.returnShallow) {
      return created as unknown as T;
    }

    const primaryParams = this.getPrimaryParams(options);
    if (primaryParams.length && primaryParams.every((p) => !isNil((created as any)[p]))) {
      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: (created as any)[p] }), {});
      return this.getOneOrFail(req);
    }

    return created as unknown as T;
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

    const entities = bulk.map((data) => this.em.create(this.entityClass, data as any));
    await this.em.flush();

    return entities as unknown as T[];
  }

  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { parsed, options } = req;
    const { allowParamsOverride, returnShallow } = options.routes.updateOneBase;
    const paramsFilters = this.getParamFilters(parsed);
    const found = await this.getOneOrFail(req, returnShallow);

    const toSave = !allowParamsOverride
      ? { ...dto, ...paramsFilters, ...parsed.authPersist }
      : { ...dto, ...parsed.authPersist };

    this.em.assign(found as any, toSave as any);
    await this.em.flush();

    if (returnShallow) {
      return found;
    }

    const primaryParams = this.getPrimaryParams(options);
    if (primaryParams.length) {
      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: (found as any)[p] }), {});
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
        ? { ...dto, ...paramsFilters, ...parsed.authPersist }
        : { ...dto, ...parsed.authPersist };

      this.em.assign(found as any, toSave as any);
      await this.em.flush();
      toReturn = found;
    } catch (error) {
      if (!(error instanceof NotFoundException)) {
        throw error;
      }
      const entity = !allowParamsOverride
        ? { ...dto, ...paramsFilters, ...parsed.authPersist }
        : { ...dto, ...parsed.authPersist };

      const created = this.em.create(this.entityClass, entity as any);
      await this.em.flush();
      toReturn = created as unknown as T;
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

    if (options.query.softDelete && this.entityHasDeleteColumn && this.softDeleteColumn) {
      this.em.assign(found as any, { [this.softDeleteColumn]: new Date() } as any);
      await this.em.flush();
    } else {
      this.em.remove(found as any);
      await this.em.flush();
    }

    return toReturn;
  }

  public async recoverOne(req: CrudRequest): Promise<void | T> {
    if (!this.entityHasDeleteColumn || !this.softDeleteColumn) {
      this.throwBadRequestException('Soft delete is not enabled for this entity');
    }

    const found = await this.getOneOrFail(req, false, true);

    this.em.assign(found as any, { [this.softDeleteColumn!]: null } as any);
    await this.em.flush();

    req.parsed.search = this.entityPrimaryColumns.reduce((acc, p) => ({ ...acc, [p]: (found as any)[p] }), {});
    return this.getOneOrFail(req);
  }

  protected get tableName(): string {
    return this.metadata.tableName;
  }

  protected onInitMapEntityColumns() {
    const props = this.metadata.properties as Record<string, EntityProperty>;
    this.propertiesMap = {};
    this.entityColumns = [];
    this.entityPrimaryColumns = [...(this.metadata.primaryKeys || [])];
    this.entityHasDeleteColumn = false;
    this.softDeleteColumn = null;

    for (const [name, prop] of Object.entries(props)) {
      if (prop.kind && typeof prop.kind === 'string') {
        continue;
      }

      if (prop.persist !== false) {
        this.propertiesMap[name] = prop;
        this.entityColumns.push(name);
      }

      const colName = name.toLowerCase();
      if (colName === 'deletedat' || colName === 'deleted_at') {
        this.entityHasDeleteColumn = true;
        this.softDeleteColumn = name;
      }
    }

    if (!this.entityHasDeleteColumn && this.metadata.filters) {
      const filters = this.metadata.filters;
      if (filters.softDelete) {
        this.entityHasDeleteColumn = true;
        const cond = filters.softDelete.cond;
        if (isObject(cond)) {
          const filterField = objKeys(cond)[0];
          if (filterField) {
            this.softDeleteColumn = filterField;
          }
        }
      }
    }
  }

  protected getColumn(field: string): EntityProperty | undefined {
    return this.propertiesMap[field];
  }

  protected getAllowedColumns(columns: string[], options: QueryOptions): string[] {
    return (!options.exclude || !options.exclude.length) && (!options.allow || !options.allow.length)
      ? columns
      : columns.filter(
          (column) =>
            (options.exclude && options.exclude.length ? !options.exclude.some((col) => col === column) : true) &&
            (options.allow && options.allow.length ? options.allow.some((col) => col === column) : true),
        );
  }

  protected getSelect(query: ParsedRequestParams, options: QueryOptions): string[] {
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

    return [...allCols].filter((col) => this.propertiesMap[col]);
  }

  protected getSort(query: ParsedRequestParams, options: QueryOptions): Record<string, 'ASC' | 'DESC'> {
    const sorts =
      query.sort && query.sort.length ? query.sort : options.sort && options.sort.length ? options.sort : [];

    const orderBy: Record<string, 'ASC' | 'DESC'> = {};
    for (const s of sorts) {
      if (!this.getColumn(s.field)) continue;
      this.checkSqlInjection(s.field);
      orderBy[s.field] = s.order === 'DESC' ? 'DESC' : 'ASC';
    }
    return orderBy;
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
    const where = this.buildWhereCondition(parsed, options, withDeleted);
    const fields = shallow ? this.entityColumns : this.getSelect(parsed, options.query);

    try {
      const found = await this.em.findOneOrFail(this.entityClass, where as any, {
        fields: fields as any,
      });
      return found as unknown as T;
    } catch {
      this.throwNotFoundException(this.tableName);
    }
  }

  protected buildWhereCondition(
    parsed: ParsedRequestParams,
    options: CrudRequest['options'],
    withDeleted = false,
  ): Record<string, any> {
    const searchWhere = this.buildSearchCondition(parsed.search);
    const softDeleteWhere =
      !withDeleted && options.query.softDelete && this.entityHasDeleteColumn && parsed.includeDeleted !== 1
        ? this.getSoftDeleteCondition()
        : undefined;

    if (searchWhere && softDeleteWhere) {
      return { $and: [searchWhere, softDeleteWhere] };
    }
    return searchWhere || softDeleteWhere || {};
  }

  protected buildSearchCondition(search: SCondition): Record<string, any> | undefined {
    if (!isObject(search)) return undefined;
    const keys = objKeys(search);
    if (!keys.length) return undefined;

    if (isArrayFull((search as any).$and)) {
      const conditions = (search as any).$and
        .map((item: SCondition) => this.buildSearchCondition(item))
        .filter(Boolean);
      if (!conditions.length) return undefined;
      return conditions.length === 1 ? conditions[0] : { $and: conditions };
    }

    if (isArrayFull((search as any).$or)) {
      const orConditions = (search as any).$or
        .map((item: SCondition) => this.buildSearchCondition(item))
        .filter(Boolean);

      const otherKeys = keys.filter((k) => k !== '$or');
      if (otherKeys.length === 0) {
        if (!orConditions.length) return undefined;
        return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
      }

      const fieldObj = this.buildFieldsCondition(otherKeys, search);
      const orPart = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
      if (!fieldObj) return orPart;
      return { $and: [fieldObj, orPart] };
    }

    return this.buildFieldsCondition(keys, search);
  }

  protected buildFieldCondition(field: string, value: any): Record<string, any> | undefined {
    if (!this.getColumn(field)) return undefined;
    this.checkSqlInjection(field);

    if (!isObject(value)) {
      return { [field]: isNull(value) ? null : value };
    }

    const operators = objKeys(value);

    if (operators.length === 1 && operators[0] === '$or' && isObject(value.$or)) {
      const orOps = objKeys(value.$or);
      const orConditions = orOps
        .map((op) => {
          const mapped = mapOperator(field, op as ComparisonOperator, value.$or[op], this.dbDialect);
          return { [field]: mapped };
        })
        .filter(Boolean);
      return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
    }

    const mapped: Record<string, any> = {};
    for (const op of operators) {
      if (op === '$or' && isObject(value.$or)) {
        continue;
      }
      const result = mapOperator(field, op as ComparisonOperator, value[op], this.dbDialect);
      if (result === null) {
        return { [field]: null };
      }
      if (isObject(result)) {
        Object.assign(mapped, result);
      } else {
        mapped[op] = result;
      }
    }

    return hasLength(objKeys(mapped)) ? { [field]: mapped } : undefined;
  }

  protected getSoftDeleteCondition(): Record<string, any> | undefined {
    if (this.entityHasDeleteColumn && this.softDeleteColumn) {
      return { [this.softDeleteColumn]: null };
    }
    return undefined;
  }

  protected buildPrimaryKeyCondition(entity: T): Record<string, any> {
    const condition: Record<string, any> = {};
    for (const pkField of this.entityPrimaryColumns) {
      condition[pkField] = (entity as any)[pkField];
    }
    return condition;
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

  protected getSoftDeleteColumnName(): string {
    return this.softDeleteColumn || 'deletedAt';
  }

  private buildFieldsCondition(keys: string[], search: any): Record<string, any> | undefined {
    if (keys.length === 1) {
      return this.buildFieldCondition(keys[0], search[keys[0]]);
    }

    const result: Record<string, any> = {};
    let hasAny = false;
    for (const field of keys) {
      const cond = this.buildFieldCondition(field, search[field]);
      if (cond) {
        Object.assign(result, cond);
        hasAny = true;
      }
    }
    return hasAny ? result : undefined;
  }

  private detectDialect() {
    const platform = (this.em as any).getPlatform?.();
    if (platform) {
      const name = platform.constructor?.name?.toLowerCase() || '';
      if (name.includes('postgres')) {
        this.dbDialect = 'postgresql';
      } else if (name.includes('mysql') || name.includes('maria')) {
        this.dbDialect = 'mysql';
      } else if (name.includes('sqlite') || name.includes('libsql') || name.includes('better')) {
        this.dbDialect = 'sqlite';
      } else {
        this.dbDialect = 'postgresql';
      }
      return;
    }
    this.dbDialect = 'postgresql';
  }

  private checkSqlInjection(field: string): string {
    for (let i = 0; i < this.sqlInjectionRegEx.length; i++) {
      if (this.sqlInjectionRegEx[i].test(field)) {
        this.throwBadRequestException(`SQL injection detected: "${field}"`);
      }
    }
    return field;
  }
}
