import {
  CreateManyDto,
  CrudConfigService,
  CrudRequest,
  CrudService,
  GetManyDefaultResponse,
  InputSanitizer,
  prepareEntityBeforeSave as prepareEntityBeforeSaveUtil,
} from '@nestjs-crud/core';
import type { CacheStrategy } from '@nestjs-crud/core/cache';
import { Logger, LoggerService, NotFoundException } from '@nestjs/common';
import { ClassType, hasLength, isArrayFull, isNil, isObject } from '@nestjs-crud/util';
import {
  EntityClass,
  EntityManager,
  EntityMetadata,
  EntityProperty,
  EntityRepository,
  IsolationLevel,
  RequestContext,
} from '@mikro-orm/core';

import { DbDialect } from './interfaces';
import { MikroOrmJoinResolver } from './mikro-orm-join-resolver';
import { MikroOrmQueryTranslator } from './mikro-orm-query-translator';

export class MikroOrmCrudService<T extends object> extends CrudService<T> {
  protected em: EntityManager;

  protected dbDialect: DbDialect;

  protected metadata: EntityMetadata<T>;

  protected entityColumns: string[];

  protected entityPrimaryColumns: string[];

  protected entityHasDeleteColumn = false;

  protected softDeleteColumn: string | null = null;

  protected propertiesMap: Record<string, EntityProperty>;

  protected readonly logger: LoggerService;

  protected readonly sanitizer: InputSanitizer;

  protected translator: MikroOrmQueryTranslator<T>;

  protected joinResolver: MikroOrmJoinResolver;

  protected readonly cacheStrategyOverride?: CacheStrategy;

  constructor(
    emOrRepo: EntityManager | EntityRepository<T>,
    protected entityClass: EntityClass<T>,
    logger?: LoggerService,
    cacheStrategy?: CacheStrategy,
  ) {
    super();
    // Property-based type guard: 'in' over `instanceof EntityRepository` for ESM
    // class-identity safety (per @mikro-orm/core v7 ESM-pure migration).
    // EntityRepository#getEntityManager() returns the same ALS-backed em proxy
    // MikroORM injects via @InjectRepository, so unwrapping preserves request-scope
    // identity-map isolation. The translator continues to read `() => this.em`
    // as a thunk (line below), never a captured reference.
    this.em = 'getEntityManager' in emOrRepo ? emOrRepo.getEntityManager() : emOrRepo;
    this.logger = logger ?? new Logger(MikroOrmCrudService.name);
    this.cacheStrategyOverride = cacheStrategy;
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

    // di-scope-awareness: pass `() => this.em` thunk, never
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
      onBadRequest: (msg: string) => {
        this.logger.warn(`SQLi guard rejected field: ${msg}`);
        this.throwBadRequestException(msg);
      },
      joinResolver: this.joinResolver,
      cacheStrategy: this._resolveCacheStrategy(),
      entityName: this.entityClass.name,
      logger: this.logger,
    });

    this.logger.debug?.(`CrudService initialized: ${(this.entityClass as any)?.name ?? 'unknown'}`);
  }

  /**
   * Returns the current EntityManager, resolving via MikroORM's ALS-backed
   * RequestContext when available. Inside `RequestContext.create(txEm, ...)` this
   * returns `txEm` — the transaction-scoped em — not the outer request em.
   * Exposed as a method so transaction regression tests can assert identity.
   *
   * @internal not part of the public CrudService contract
   */
  public getEm(): EntityManager {
    return this.em;
  }

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    const { parsed, options } = req;
    const qb = (this.em as any).createQueryBuilder(this.entityClass);
    this.translator.applyToQuery(qb, parsed, options);

    if (this.decidePagination(parsed, options)) {
      const countQb = (this.em as any).createQueryBuilder(this.entityClass);
      this.translator.applyToQuery(countQb, parsed, options);
      // Pagination bypasses the cache wrap (count + data would need separate keys;
      // correctness trade-off: only non-paginated getMany benefits from cache).
      const [data, total] = [await qb.getResult(), await this.translator.count(countQb)];
      const take = this.translator.getTake(parsed, options.query);
      const skip = this.translator.getSkip(parsed, take as number);
      return this.createPageInfo(data as T[], total, take || total, skip || 0);
    }

    // Non-paginated: route through the FetchHelper cache wrap path.
    return (this.translator as any).executeMany(qb, parsed, options) as Promise<T[]>;
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
    await this._invalidateCache();

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
    await this._invalidateCache();

    return entities as T[];
  }

  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    // Wrap read-modify-write in em.transactional at READ_COMMITTED.
    // RequestContext.create(txEm, ...) rebinds the ALS-backed em so that
    // getEm() / this.em inside the callback resolves to txEm — the
    // FetchHelper thunk (getEm: () => EntityManager) is therefore unchanged
    // (getEm thunk contract preserved).
    const em = this.getEm();
    const result = await em.transactional(
      async (txEm) => {
        return RequestContext.create(txEm, async () => {
          const { parsed, options } = req;
          const { allowParamsOverride, returnShallow } = options.routes.updateOneBase;
          const paramsFilters = this.getParamFilters(parsed);
          const found = await this.getOneOrFail(req, returnShallow);

          const toSave = !allowParamsOverride
            ? { ...dto, ...paramsFilters, ...parsed.authPersist }
            : { ...dto, ...parsed.authPersist };

          try {
            this.getEm().assign(found as any, toSave as any);
            await this.getEm().flush();
          } catch (err) {
            // PII GUARD: DB drivers surface SQL + bound params in err.message.
            this.logger.error(
              `CrudService [updateOne] failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
              err instanceof Error ? err.stack : String(err),
            );
            throw err;
          }

          if (returnShallow) {
            return found;
          }

          const primaryParams = this.getPrimaryParams(options);
          if (primaryParams.length) {
            req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: (found as any)[p] }), {});
          }
          return this.getOneOrFail(req);
        });
      },
      { isolationLevel: IsolationLevel.READ_COMMITTED },
    );
    await this._invalidateCache();
    return result;
  }

  public async replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const em = this.getEm();
    const result = await em.transactional(
      async (txEm) => {
        return RequestContext.create(txEm, async () => {
          const { parsed, options } = req;
          const { allowParamsOverride, returnShallow } = options.routes.replaceOneBase;
          const paramsFilters = this.getParamFilters(parsed);

          let toReturn: T;
          try {
            const found = await this.getOneOrFail(req, returnShallow);
            const toSave = !allowParamsOverride
              ? { ...dto, ...paramsFilters, ...parsed.authPersist }
              : { ...dto, ...parsed.authPersist };

            this.getEm().assign(found as any, toSave as any);
            await this.getEm().flush();
            toReturn = found;
          } catch (error) {
            if (!(error instanceof NotFoundException)) {
              // PII GUARD: DB drivers surface SQL + bound params in err.message.
              this.logger.error(
                `CrudService [replaceOne] failed: ${error instanceof Error ? error.name : 'UnknownError'}`,
                error instanceof Error ? error.stack : String(error),
              );
              throw error;
            }
            const entity = !allowParamsOverride
              ? { ...dto, ...paramsFilters, ...parsed.authPersist }
              : { ...dto, ...parsed.authPersist };

            const created = this.getEm().create(this.entityClass, entity as any);
            await this.getEm().flush();
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
        });
      },
      { isolationLevel: IsolationLevel.READ_COMMITTED },
    );
    await this._invalidateCache();
    return result;
  }

  public async deleteOne(req: CrudRequest): Promise<void | T> {
    const em = this.getEm();
    const result = await em.transactional(
      async (txEm) => {
        return RequestContext.create(txEm, async () => {
          const { options } = req;
          const { returnDeleted } = options.routes.deleteOneBase;
          const found = await this.getOneOrFail(req, true);
          const toReturn = returnDeleted ? ({ ...found } as T) : undefined;

          try {
            if (options.query.softDelete && this.entityHasDeleteColumn && this.softDeleteColumn) {
              this.getEm().assign(found as any, { [this.softDeleteColumn]: new Date() } as any);
              await this.getEm().flush();
            } else {
              this.getEm().remove(found as any);
              await this.getEm().flush();
            }
          } catch (err) {
            // PII GUARD: DB drivers surface SQL + bound params in err.message.
            this.logger.error(
              `CrudService [deleteOne] failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
              err instanceof Error ? err.stack : String(err),
            );
            throw err;
          }

          return toReturn;
        });
      },
      { isolationLevel: IsolationLevel.READ_COMMITTED },
    );
    await this._invalidateCache();
    return result;
  }

  public async recoverOne(req: CrudRequest): Promise<void | T> {
    if (!this.entityHasDeleteColumn || !this.softDeleteColumn) {
      this.throwBadRequestException('Soft delete is not enabled for this entity');
    }

    const found = await this.getOneOrFail(req, false, true);

    this.em.assign(found as any, { [this.softDeleteColumn!]: null } as any);
    await this.em.flush();
    await this._invalidateCache();

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

  /**
   * Resolves the effective cache strategy: ctor override takes precedence,
   * falling back to the global strategy registered via CrudConfigService.
   * Called lazily at request time so CrudConfigService.load() after app bootstrap works.
   */
  protected _resolveCacheStrategy(): CacheStrategy | undefined {
    return this.cacheStrategyOverride ?? CrudConfigService.config.query?.cacheStrategy;
  }

  /**
   * Invalidates all cache entries prefixed with `<entityClass.name>:`.
   * Called automatically after every successful write. Errors are swallowed
   * with a warning so a Redis outage does not break write paths.
   */
  protected async _invalidateCache(): Promise<void> {
    const strategy = this._resolveCacheStrategy();
    if (!strategy) return;
    try {
      await strategy.invalidate(`${this.entityClass.name}:`);
    } catch (err) {
      this.logger.warn?.(
        `CacheStrategy.invalidate failed for ${this.entityClass.name}: ${err instanceof Error ? err.name : 'UnknownError'}`,
      );
    }
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
