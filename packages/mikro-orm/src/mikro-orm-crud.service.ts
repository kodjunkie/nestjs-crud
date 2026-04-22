import {
  CreateManyDto,
  CrudRequest,
  CrudService,
  GetManyDefaultResponse,
  InputSanitizer,
  prepareEntityBeforeSave as prepareEntityBeforeSaveUtil,
} from '@nestjs-crud/core';
import { NotFoundException } from '@nestjs/common';
import { ClassType, hasLength, isArrayFull, isNil, isObject } from '@nestjs-crud/util';
import { EntityManager, EntityClass, EntityProperty } from '@mikro-orm/core';

import { DbDialect } from './interfaces';
import { MikroOrmJoinResolver } from './mikro-orm-join-resolver';
import { MikroOrmQueryTranslator } from './mikro-orm-query-translator';

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

  protected readonly sanitizer: InputSanitizer;

  protected translator: MikroOrmQueryTranslator<T>;

  protected joinResolver: MikroOrmJoinResolver;

  constructor(
    protected em: EntityManager,
    protected entityClass: EntityClass<T>,
  ) {
    super();
    this.metadata = this.em.getMetadata().get(this.entityClass);
    this.onInitMapEntityColumns();
    this.detectDialect();

    this.sanitizer = new InputSanitizer({
      allowedColumns: () => new Set(this.entityColumns),
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
    });

    this.joinResolver = new MikroOrmJoinResolver({
      metadata: this.metadata,
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
    });

    // di-scope-awareness (T-06-02): pass `() => this.em` thunk, never
    // a captured `this.em` reference. MikroORM request-scope middleware
    // returns a fresh per-request em; the translator resolves via the
    // thunk each call so the identity map never goes stale.
    this.translator = new MikroOrmQueryTranslator<T>(() => this.em, {
      entityColumns: this.entityColumns,
      entityPrimaryColumns: this.entityPrimaryColumns,
      propertiesMap: this.propertiesMap,
      entityHasDeleteColumn: this.entityHasDeleteColumn,
      softDeleteColumn: this.softDeleteColumn,
      dbDialect: this.dbDialect,
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
      joinResolver: this.joinResolver,
    });
  }

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    const { parsed, options } = req;
    const qb = (this.em as any).createQueryBuilder(this.entityClass);
    this.translator.applyToQuery(qb, parsed, options);

    if (this.decidePagination(parsed, options)) {
      const countQb = (this.em as any).createQueryBuilder(this.entityClass);
      this.translator.applyToQuery(countQb, parsed, options);
      const [data, total] = [await qb.getResult(), await this.translator.count(countQb)];
      const take = this.translator.getTake(parsed, options.query);
      const skip = this.translator.getSkip(parsed, take as number);
      return this.createPageInfo(data as T[], total, take || total, skip || 0);
    }

    const data = await qb.getResult();
    return data as T[];
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
      return created as T;
    }

    const primaryParams = this.getPrimaryParams(options);
    if (primaryParams.length && primaryParams.every((p) => !isNil((created as any)[p]))) {
      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: (created as any)[p] }), {});
      return this.getOneOrFail(req);
    }

    return created as T;
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

    return entities as T[];
  }

  // TODO(SEC-03): wrap read-modify-write in em.transactional() — Phase 8 SEC-03
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

  // TODO(SEC-03): wrap read-modify-write in em.transactional() — Phase 8 SEC-03
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
      toReturn = created as T;
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

  // TODO(SEC-03): wrap read-modify-write in em.transactional() — Phase 8 SEC-03
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

    // Relation kinds to skip: MikroORM v7 uses ReferenceKind enum strings.
    // Decorator-based entities leave scalar `kind` undefined; EntitySchema-based entities
    // set it to 'scalar'. We must NOT skip scalars — only skip actual relation/embedded kinds.
    const RELATION_KINDS = new Set(['m:1', '1:m', 'm:n', '1:1', 'embedded']);

    for (const [name, prop] of Object.entries(props)) {
      if (prop.kind && RELATION_KINDS.has(prop.kind as string)) {
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
          const filterField = Object.keys(cond)[0];
          if (filterField) {
            this.softDeleteColumn = filterField;
          }
        }
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

  protected async getOneOrFail(req: CrudRequest, _shallow = false, withDeleted = false): Promise<T> {
    // When recovering a soft-deleted entity, override includeDeleted so the
    // soft-delete WHERE clause is skipped and the deleted row is found.
    const parsed = withDeleted ? { ...req.parsed, includeDeleted: 1 as const } : req.parsed;
    return this.translator.findOneOrFail(parsed, req.options, {
      entityClass: this.entityClass,
      onNotFound: () => new NotFoundException(`${this.tableName} not found`),
    });
  }

  protected prepareEntityBeforeSave(dto: T | Partial<T>, parsed: CrudRequest['parsed']): T | undefined {
    return prepareEntityBeforeSaveUtil(dto, parsed, this.entityClass as ClassType<T>);
  }

  protected getSoftDeleteColumnName(): string {
    return this.softDeleteColumn || 'deletedAt';
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
}
