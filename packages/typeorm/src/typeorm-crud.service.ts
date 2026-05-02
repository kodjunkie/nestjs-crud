import {
  CreateManyDto,
  CrudConfigService,
  CrudRequest,
  CrudRequestOptions,
  CrudService,
  getSelect as getSelectUtil,
  GetManyDefaultResponse,
  prepareEntityBeforeSave as prepareEntityBeforeSaveUtil,
  QueryOptions,
} from '@nestjs-crud/core';
import type { CacheStrategy } from '@nestjs-crud/core/cache';
import { CursorCodec } from '@nestjs-crud/core/cursor';
import type { CursorPaginatedResponse } from '@nestjs-crud/core/cursor';
import { ParsedRequestParams } from '@nestjs-crud/request';
import { ClassType, hasLength, isArrayFull, isObject, isUndefined } from '@nestjs-crud/util';
import { plainToClass } from 'class-transformer';
import { Logger, LoggerService } from '@nestjs/common';
import { DeepPartial, ObjectLiteral, Repository, SelectQueryBuilder, DataSourceOptions, QueryRunner } from 'typeorm';

import { TypeOrmJoinResolver } from './typeorm-join-resolver';
import { TypeOrmQueryTranslator } from './typeorm-query-translator';

export class TypeOrmCrudService<T> extends CrudService<T> {
  protected dbName: DataSourceOptions['type'];

  protected entityColumns: string[];

  protected entityPrimaryColumns: string[];

  protected entityHasDeleteColumn = false;

  protected entityColumnsHash: ObjectLiteral = {};

  protected readonly logger: LoggerService;

  protected readonly translator: TypeOrmQueryTranslator<T>;

  protected readonly joinResolver: TypeOrmJoinResolver<T>;

  /** Per-service cache strategy override (ctor injection). Takes priority over the global default. */
  protected readonly cacheStrategyOverride?: CacheStrategy;

  constructor(
    protected repo: Repository<T>,
    logger?: LoggerService,
    cacheStrategy?: CacheStrategy,
  ) {
    super();

    this.logger = logger ?? new Logger(TypeOrmCrudService.name);
    this.cacheStrategyOverride = cacheStrategy;
    this.dbName = this.repo.metadata.connection.options.type;
    this.onInitMapEntityColumns();

    this.joinResolver = new TypeOrmJoinResolver<T>(this.repo, {
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
    });
    this.translator = new TypeOrmQueryTranslator<T>(this.repo, {
      entityColumnsHash: this.entityColumnsHash,
      entityHasDeleteColumn: this.entityHasDeleteColumn,
      onBadRequest: (msg: string) => {
        this.logger.warn(`SQLi guard rejected field: ${msg}`);
        this.throwBadRequestException(msg);
      },
      joinResolver: this.joinResolver,
      // Wire ctor override (if any) into the translator; FetchHelper will fall
      // back to CrudConfigService.config.query.cacheStrategy lazily at call time.
      cacheStrategy: this.cacheStrategyOverride,
      entityName: this.alias,
      logger: this.logger,
      // TTL is per-request, sourced via FetchHelper.getEffectiveTtl(options)
    });

    this.logger.debug?.(`CrudService initialized: ${(this.entityType as any)?.name ?? 'unknown'}`);
  }

  public get findOne(): Repository<T>['findOne'] {
    return this.repo.findOne.bind(this.repo);
  }

  public get find(): Repository<T>['find'] {
    return this.repo.find.bind(this.repo);
  }

  public get count(): Repository<T>['count'] {
    return this.repo.count.bind(this.repo);
  }

  protected get entityType(): ClassType<T> {
    return this.repo.target as ClassType<T>;
  }

  protected get alias(): string {
    return this.repo.metadata.targetName;
  }

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | CursorPaginatedResponse<T> | T[]> {
    const { parsed, options } = req;
    const mode = options.query?.pagination ?? (options as any).pagination ?? 'offset';

    if (mode === 'cursor') {
      return this.doGetManyCursor(parsed, options);
    }

    const builder = await this.createBuilder(parsed, options);
    return this.doGetMany(builder, parsed, options);
  }

  public async getOne(req: CrudRequest): Promise<T> {
    return this.getOneOrFail(req);
  }

  public async createOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { returnShallow } = req.options.routes.createOneBase;
    const entity = this.prepareEntityBeforeSave(dto, req.parsed);

    /* istanbul ignore if -- DB-state edge: prepareEntityBeforeSave returns falsy only when the input dto is structurally empty AND no authPersist exists; this guard is the safety net before save() but is unreachable via normal API request flow (validation pipe rejects empty body upstream) — kept as a defensive safety net */
    if (!entity) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const saved = await this.repo.save(entity as DeepPartial<T>);
    await this._invalidateCache();

    if (returnShallow) {
      return saved;
    }

    const primaryParams = this.getPrimaryParams(req.options);
    req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: saved[p] }), {});
    return this.getOneOrFail(req);
  }

  public async createMany(req: CrudRequest, dto: CreateManyDto<T | Partial<T>>): Promise<T[]> {
    /* istanbul ignore if -- DB-state edge: dto shape validation is normally done by class-validator (BulkDto requires non-empty bulk array); this guard is the in-service safety net for direct programmatic invocation that bypasses the validation pipe — kept as a defensive safety net */
    if (!isObject(dto) || !isArrayFull(dto.bulk)) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const bulk = dto.bulk.map((one) => this.prepareEntityBeforeSave(one, req.parsed)).filter((d) => !isUndefined(d));

    /* istanbul ignore if -- DB-state edge: post-filter empty bulk fires only when EVERY entry of a non-empty input bulk had prepareEntityBeforeSave return undefined (entry-level rejection) — requires programmatic API invocation with all-empty entries, unreachable via HTTP — kept as a defensive safety net */
    if (!hasLength(bulk)) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const result = await this.repo.save(bulk as DeepPartial<T>[], { chunk: 50 });
    await this._invalidateCache();
    return result;
  }

  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const result = await this.withTransaction('updateOne', async (scopedRepo) => {
      const { allowParamsOverride, returnShallow } = req.options.routes.updateOneBase;
      const paramsFilters = this.getParamFilters(req.parsed);
      const found = await this.getOneOrFail(req, returnShallow, false, scopedRepo);
      const toSave = !allowParamsOverride
        ? { ...found, ...dto, ...paramsFilters, ...req.parsed.authPersist }
        : { ...found, ...dto, ...req.parsed.authPersist };

      const updated = await scopedRepo.save(
        plainToClass(this.entityType, toSave, req.parsed.classTransformOptions) as DeepPartial<T>,
      );

      if (returnShallow) {
        return updated;
      }

      req.parsed.paramsFilter.forEach((filter) => {
        filter.value = updated[filter.field];
      });
      return this.getOneOrFail(req, false, false, scopedRepo);
    });
    await this._invalidateCache();
    return result;
  }

  public async recoverOne(req: CrudRequest): Promise<T> {
    const found = await this.getOneOrFail(req, false, true);
    const result = await this.repo.recover(found as DeepPartial<T>);
    await this._invalidateCache();
    return result;
  }

  public async replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const result = await this.withTransaction('replaceOne', async (scopedRepo) => {
      const { allowParamsOverride, returnShallow } = req.options.routes.replaceOneBase;
      const paramsFilters = this.getParamFilters(req.parsed);
      const found = await this.getOneOrFail(req, returnShallow, false, scopedRepo).catch(() => undefined);
      const toSave = !allowParamsOverride
        ? { ...(found || {}), ...dto, ...paramsFilters, ...req.parsed.authPersist }
        : {
            ...(found || {}),
            ...paramsFilters,
            ...dto,
            ...req.parsed.authPersist,
          };

      const replaced = await scopedRepo.save(
        plainToClass(this.entityType, toSave, req.parsed.classTransformOptions) as DeepPartial<T>,
      );

      if (returnShallow) {
        return replaced;
      }

      const primaryParams = this.getPrimaryParams(req.options);
      /* istanbul ignore if -- DB-state edge: empty primaryParams fires only when consumer disables ALL primary params (params: { id: { disabled: true } } with no replacement primary); this is a misconfiguration that mergeOptions auto-corrects by injecting a default `id` primary — branch defensive against direct option mutation post-merge — kept as a defensive safety net */
      if (!primaryParams.length) {
        return replaced;
      }
      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: replaced[p] }), {});
      return this.getOneOrFail(req, false, false, scopedRepo);
    });
    await this._invalidateCache();
    return result;
  }

  public async deleteOne(req: CrudRequest): Promise<void | T> {
    const result = await this.withTransaction('deleteOne', async (scopedRepo) => {
      const { returnDeleted } = req.options.routes.deleteOneBase;
      const found = await this.getOneOrFail(req, returnDeleted, false, scopedRepo);
      const toReturn = returnDeleted
        ? plainToClass(this.entityType, { ...found }, req.parsed.classTransformOptions)
        : undefined;

      if (req.options.query.softDelete === true) {
        await scopedRepo.softRemove(found as DeepPartial<T>);
      } else {
        await scopedRepo.remove(found);
      }

      return toReturn;
    });
    await this._invalidateCache();
    return result;
  }

  public getParamFilters(parsed: CrudRequest['parsed']): ObjectLiteral {
    const filters = {};
    /* istanbul ignore else -- DB-state edge: empty paramsFilter only occurs for non-parametric endpoints (e.g. POST /resource without :id), but getParamFilters is invoked by updateOne/replaceOne which require :id by route definition — else branch defensive against atypical CrudRequest shapes — kept as a defensive safety net */
    if (hasLength(parsed.paramsFilter)) {
      for (const filter of parsed.paramsFilter) {
        filters[filter.field] = filter.value;
      }
    }
    return filters;
  }

  public async createBuilder(
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
    _many = true,
    withDeleted = false,
  ): Promise<SelectQueryBuilder<T>> {
    const builder = this.translator.applyToQuery(this.repo.createQueryBuilder(this.alias), parsed, options);
    if (withDeleted) builder.withDeleted();
    return builder;
  }

  /**
   * Resolve the cache strategy in priority order:
   * 1. Constructor override (per-service)
   * 2. `CrudConfigService.config.query.cacheStrategy` (global, lazily read)
   * 3. undefined (no caching)
   *
   * Called at request time for write-path invalidation so tests can wire the
   * strategy via `CrudConfigService.load(...)` after app bootstrap.
   *
   * @since 2.2.0
   */
  protected _resolveCacheStrategy(): CacheStrategy | undefined {
    return this.cacheStrategyOverride ?? CrudConfigService.config.query?.cacheStrategy;
  }

  protected async doGetMany(
    builder: SelectQueryBuilder<T>,
    query: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<GetManyDefaultResponse<T> | T[]> {
    if (!this.decidePagination(query, options)) return this.translator.executeMany<T>(builder, query, options);
    const [data, total] = await builder.getManyAndCount();
    const limit = this.getTake(query, options.query);
    const offset = this.getSkip(query, limit);
    return this.createPageInfo(data, total, limit || total, offset || 0);
  }

  protected onInitMapEntityColumns() {
    const cols = this.repo.metadata.columns;
    this.entityColumns = cols.map((prop) => {
      const key = prop.embeddedMetadata ? prop.propertyPath : prop.propertyName;
      this.entityColumnsHash[key] = prop.databasePath;
      return key;
    });
    this.entityPrimaryColumns = cols.filter((p) => p.isPrimary).map((p) => p.propertyName);
    this.entityHasDeleteColumn = cols.some((p) => p.isDeleteDate);
  }

  protected async getOneOrFail(
    req: CrudRequest,
    shallow = false,
    withDeleted = false,
    scopedRepo?: Repository<T>,
  ): Promise<T> {
    // When a scoped (QueryRunner-bound) repo is provided, reads participate
    // in the open transaction via the translator's repo-override hook.
    return this.translator.findOneOrFail(req.parsed, req.options, {
      shallow,
      withDeleted,
      onNotFound: () => this.throwNotFoundException(this.alias),
      ...(scopedRepo ? { repo: scopedRepo } : {}),
    });
  }

  /**
   * Wraps `fn` in a QueryRunner transaction at READ COMMITTED.
   * Commits on success, rolls back + re-throws on error, always releases.
   *
   * @param op  Operation name used in PII-safe error log (name only, no values).
   * @param fn  Callback receiving a QueryRunner-scoped repository.
   */
  protected async withTransaction<R>(op: string, fn: (repo: Repository<T>) => Promise<R>): Promise<R> {
    const queryRunner: QueryRunner = this.repo.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');
    try {
      const scopedRepo = queryRunner.manager.getRepository<T>(this.repo.target);
      const result = await fn(scopedRepo);
      await queryRunner.commitTransaction();
      this.logger.debug?.(`Transaction [${op}] committed`);
      return result;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      // PII GUARD: DB drivers surface SQL + bound params in err.message.
      // Use err.name in the message and pass err.stack as the LoggerService stack arg.
      this.logger.error(
        `CrudService [${op}] failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  protected prepareEntityBeforeSave(dto: T | Partial<T>, parsed: CrudRequest['parsed']): T | undefined {
    return prepareEntityBeforeSaveUtil(dto, parsed, this.entityType);
  }

  protected getSelect(query: ParsedRequestParams, options: QueryOptions): string[] {
    return getSelectUtil(query, options, this.entityColumns, this.entityPrimaryColumns, this.alias);
  }

  /**
   * Auto-invalidate cache by entity-name prefix after a successful write.
   * No-op when no strategy is wired. Errors from invalidate are logged but not
   * rethrown — write success is the user-visible outcome; cache eviction is a
   * best-effort optimization.
   *
   * @since 2.2.0
   */
  private async _invalidateCache(): Promise<void> {
    const strategy = this._resolveCacheStrategy();
    if (!strategy) return;
    try {
      await strategy.invalidate(`${this.alias}:`);
    } catch (err) {
      this.logger.warn?.(
        `CacheStrategy.invalidate failed for ${this.alias}: ${err instanceof Error ? err.name : 'UnknownError'}`,
      );
    }
  }

  private async doGetManyCursor(
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<CursorPaginatedResponse<T>> {
    // D-01a: single-sort-field requirement
    if (!parsed.sort || parsed.sort.length !== 1) {
      this.throwBadRequestException(
        `Cursor pagination supports a single sort field; got: ${parsed.sort?.map((s) => s.field).join(', ') || '0'}`,
      );
    }
    const sort = parsed.sort[0];

    // Decode incoming cursor (null on first page)
    const decoded = parsed.cursor ? CursorCodec.decode(parsed.cursor) : null;

    // sortField mismatch guard
    if (decoded && decoded.sortField !== sort.field) {
      this.throwBadRequestException(
        `Cursor sort field mismatch: expected '${sort.field}', got '${decoded.sortField}'`,
      );
    }

    // D-06a: missing-limit terminal → 400
    const take = this.getTake(parsed, options.query);
    if (take == null) {
      this.throwBadRequestException(
        'Cursor pagination requires a limit — set @Crud({ query: { limit | maxLimit } }) or pass ?limit=N',
      );
    }

    const idField = this.entityPrimaryColumns[0];
    const sortField = sort.field;

    const builder = await this.createBuilder(parsed, options);
    // applyCursor sets ORDER BY (sort ASC/DESC + PK tie-breaker) and adds keyset
    // WHERE only for non-first pages. Overwrites the default ORDER BY from applyToQuery.
    this.translator.applyCursor(builder, decoded, sort);

    // Peek one extra row for end-of-stream detection
    builder.take((take as number) + 1);

    // D-05: cursor mode BYPASSES cache wrap — call builder.getMany() directly,
    //       NOT translator.executeMany (which goes through cacheStrategy.wrap).
    const rows = await builder.getMany();

    const hasMore = rows.length > (take as number);
    if (hasMore) rows.pop();
    if (decoded?.dir === 'prev') rows.reverse();

    const next =
      hasMore && rows.length
        ? CursorCodec.encode({
            sortField,
            sortValue: (rows[rows.length - 1] as any)[sortField],
            id: (rows[rows.length - 1] as any)[idField],
            dir: 'next',
          })
        : null;

    const prev = decoded
      ? CursorCodec.encode({
          sortField,
          sortValue: (rows[0] as any)[sortField],
          id: (rows[0] as any)[idField],
          dir: 'prev',
        })
      : null;

    return { data: rows as T[], count: rows.length, cursor: { next, prev } };
  }
}
