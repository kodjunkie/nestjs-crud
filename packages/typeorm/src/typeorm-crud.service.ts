import {
  CreateManyDto,
  CrudRequest,
  CrudRequestOptions,
  CrudService,
  GetManyDefaultResponse,
  QueryOptions,
} from '@nestjs-crud/core';
import { ParsedRequestParams } from '@nestjs-crud/request';
import { ClassType, hasLength, isArrayFull, isObject, isUndefined, objKeys, isNil } from '@nestjs-crud/util';
import { plainToClass } from 'class-transformer';
import { DeepPartial, ObjectLiteral, Repository, SelectQueryBuilder, DataSourceOptions } from 'typeorm';

import { TypeOrmJoinResolver } from './typeorm-join-resolver';
import { TypeOrmQueryTranslator } from './typeorm-query-translator';

export class TypeOrmCrudService<T> extends CrudService<T> {
  protected dbName: DataSourceOptions['type'];

  protected entityColumns: string[];

  protected entityPrimaryColumns: string[];

  protected entityHasDeleteColumn = false;

  protected entityColumnsHash: ObjectLiteral = {};

  protected readonly translator: TypeOrmQueryTranslator<T>;

  protected readonly joinResolver: TypeOrmJoinResolver<T>;

  constructor(protected repo: Repository<T>) {
    super();

    this.dbName = this.repo.metadata.connection.options.type;
    this.onInitMapEntityColumns();

    this.joinResolver = new TypeOrmJoinResolver<T>(this.repo, {
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
    });
    this.translator = new TypeOrmQueryTranslator<T>(this.repo, {
      entityColumnsHash: this.entityColumnsHash,
      entityHasDeleteColumn: this.entityHasDeleteColumn,
      onBadRequest: (msg: string) => this.throwBadRequestException(msg),
      joinResolver: this.joinResolver,
    });
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

  /**
   * Get many
   * @param req
   */
  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    const { parsed, options } = req;
    const builder = await this.createBuilder(parsed, options);
    return this.doGetMany(builder, parsed, options);
  }

  /**
   * Get one
   * @param req
   */
  public async getOne(req: CrudRequest): Promise<T> {
    return this.getOneOrFail(req);
  }

  /**
   * Create one
   * @param req
   * @param dto
   */
  public async createOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { returnShallow } = req.options.routes.createOneBase;
    const entity = this.prepareEntityBeforeSave(dto, req.parsed);

    /* istanbul ignore if */
    if (!entity) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const saved = await this.repo.save(entity as DeepPartial<T>);

    if (returnShallow) {
      return saved;
    } else {
      const primaryParams = this.getPrimaryParams(req.options);

      /* istanbul ignore next */
      if (!primaryParams.length && primaryParams.some((p) => isNil(saved[p]))) {
        return saved;
      } else {
        req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: saved[p] }), {});
        return this.getOneOrFail(req);
      }
    }
  }

  /**
   * Create many
   * @param req
   * @param dto
   */
  public async createMany(req: CrudRequest, dto: CreateManyDto<T | Partial<T>>): Promise<T[]> {
    /* istanbul ignore if */
    if (!isObject(dto) || !isArrayFull(dto.bulk)) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    const bulk = dto.bulk.map((one) => this.prepareEntityBeforeSave(one, req.parsed)).filter((d) => !isUndefined(d));

    /* istanbul ignore if */
    if (!hasLength(bulk)) {
      this.throwBadRequestException('Empty data. Nothing to save.');
    }

    return this.repo.save(bulk as DeepPartial<T>[], { chunk: 50 });
  }

  /**
   * Update one
   * @param req
   * @param dto
   */
  // TODO(SEC-03): wrap read-modify-write in QueryRunner — Phase 8 SEC-03
  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { allowParamsOverride, returnShallow } = req.options.routes.updateOneBase;
    const paramsFilters = this.getParamFilters(req.parsed);
    const found = await this.getOneOrFail(req, returnShallow);
    const toSave = !allowParamsOverride
      ? { ...found, ...dto, ...paramsFilters, ...req.parsed.authPersist }
      : { ...found, ...dto, ...req.parsed.authPersist };
    const updated = await this.repo.save(
      plainToClass(this.entityType, toSave, req.parsed.classTransformOptions) as DeepPartial<T>,
    );

    if (returnShallow) {
      return updated;
    } else {
      req.parsed.paramsFilter.forEach((filter) => {
        filter.value = updated[filter.field];
      });

      return this.getOneOrFail(req);
    }
  }

  /**
   * Recover one
   * @param req
   * @param dto
   */
  public async recoverOne(req: CrudRequest): Promise<T> {
    const found = await this.getOneOrFail(req, false, true);
    return this.repo.recover(found as DeepPartial<T>);
  }

  /**
   * Replace one
   * @param req
   * @param dto
   */
  // TODO(SEC-03): wrap read-modify-write in QueryRunner — Phase 8 SEC-03
  public async replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    const { allowParamsOverride, returnShallow } = req.options.routes.replaceOneBase;
    const paramsFilters = this.getParamFilters(req.parsed);
    const found = await this.getOneOrFail(req, returnShallow).catch(() => undefined);
    const toSave = !allowParamsOverride
      ? { ...(found || {}), ...dto, ...paramsFilters, ...req.parsed.authPersist }
      : {
          ...(found || /* istanbul ignore next */ {}),
          ...paramsFilters,
          ...dto,
          ...req.parsed.authPersist,
        };
    const replaced = await this.repo.save(
      plainToClass(this.entityType, toSave, req.parsed.classTransformOptions) as DeepPartial<T>,
    );

    if (returnShallow) {
      return replaced;
    } else {
      const primaryParams = this.getPrimaryParams(req.options);

      /* istanbul ignore if */
      if (!primaryParams.length) {
        return replaced;
      }

      req.parsed.search = primaryParams.reduce((acc, p) => ({ ...acc, [p]: replaced[p] }), {});
      return this.getOneOrFail(req);
    }
  }

  /**
   * Delete one
   * @param req
   */
  // TODO(SEC-03): wrap read-modify-write in QueryRunner — Phase 8 SEC-03
  public async deleteOne(req: CrudRequest): Promise<void | T> {
    const { returnDeleted } = req.options.routes.deleteOneBase;
    const found = await this.getOneOrFail(req, returnDeleted);
    const toReturn = returnDeleted
      ? plainToClass(this.entityType, { ...found }, req.parsed.classTransformOptions)
      : undefined;
    if (req.options.query.softDelete === true) {
      await this.repo.softRemove(found as DeepPartial<T>);
    } else {
      await this.repo.remove(found);
    }
    return toReturn;
  }

  public getParamFilters(parsed: CrudRequest['parsed']): ObjectLiteral {
    const filters = {};

    /* istanbul ignore else */
    if (hasLength(parsed.paramsFilter)) {
      for (const filter of parsed.paramsFilter) {
        filters[filter.field] = filter.value;
      }
    }

    return filters;
  }

  /**
   * Create TypeOrm QueryBuilder
   * @param parsed
   * @param options
   * @param many
   */
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
   * depends on paging call `SelectQueryBuilder#getMany` or `SelectQueryBuilder#getManyAndCount`
   * helpful for overriding `TypeOrmCrudService#getMany`
   * @see getMany
   * @see SelectQueryBuilder#getMany
   * @see SelectQueryBuilder#getManyAndCount
   * @param builder
   * @param query
   * @param options
   */
  protected async doGetMany(
    builder: SelectQueryBuilder<T>,
    query: ParsedRequestParams,
    options: CrudRequestOptions,
  ): Promise<GetManyDefaultResponse<T> | T[]> {
    if (this.decidePagination(query, options)) {
      const [data, total] = await builder.getManyAndCount();
      const limit = this.getTake(query, options.query);
      const offset = this.getSkip(query, limit);

      return this.createPageInfo(data, total, limit || total, offset || 0);
    }

    return builder.getMany();
  }

  protected onInitMapEntityColumns() {
    this.entityColumns = this.repo.metadata.columns.map((prop) => {
      // In case column is an embedded, use the propertyPath to get complete path
      if (prop.embeddedMetadata) {
        this.entityColumnsHash[prop.propertyPath] = prop.databasePath;
        return prop.propertyPath;
      }
      this.entityColumnsHash[prop.propertyName] = prop.databasePath;
      return prop.propertyName;
    });
    this.entityPrimaryColumns = this.repo.metadata.columns
      .filter((prop) => prop.isPrimary)
      .map((prop) => prop.propertyName);
    this.entityHasDeleteColumn = this.repo.metadata.columns.filter((prop) => prop.isDeleteDate).length > 0;
  }

  protected async getOneOrFail(req: CrudRequest, shallow = false, withDeleted = false): Promise<T> {
    const { parsed, options } = req;
    const builder = shallow
      ? this.repo.createQueryBuilder(this.alias)
      : await this.createBuilder(parsed, options, true, withDeleted);

    if (shallow) {
      const where = this.translator.buildWhere(parsed.search);
      if (where) builder.andWhere(where);
    }

    const found = withDeleted ? await builder.withDeleted().getOne() : await builder.getOne();

    if (!found) {
      this.throwNotFoundException(this.alias);
    }

    return found;
  }

  protected prepareEntityBeforeSave(dto: T | Partial<T>, parsed: CrudRequest['parsed']): T {
    /* istanbul ignore if */
    if (!isObject(dto)) {
      return undefined;
    }

    if (hasLength(parsed.paramsFilter)) {
      for (const filter of parsed.paramsFilter) {
        dto[filter.field] = filter.value;
      }
    }

    /* istanbul ignore if */
    if (!hasLength(objKeys(dto))) {
      return undefined;
    }

    return dto instanceof this.entityType
      ? Object.assign(dto, parsed.authPersist)
      : plainToClass(this.entityType, { ...dto, ...parsed.authPersist }, parsed.classTransformOptions);
  }

  protected getSelect(query: ParsedRequestParams, options: QueryOptions): string[] {
    const allowed = this.getAllowedColumns(this.entityColumns, options);

    const columns =
      query.fields && query.fields.length
        ? query.fields.filter((field) => allowed.some((col) => field === col))
        : allowed;

    const select = new Set(
      [
        ...(options.persist && options.persist.length ? options.persist : []),
        ...columns,
        ...this.entityPrimaryColumns,
      ].map((col) => `${this.alias}.${col}`),
    );

    return Array.from(select);
  }
}
