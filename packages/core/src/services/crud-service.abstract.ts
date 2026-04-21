import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ParsedRequestParams } from '@nestjs-crud/request';
import { objKeys } from '@nestjs-crud/util';

import { CreateManyDto, CrudRequest, CrudRequestOptions, GetManyDefaultResponse, QueryOptions } from '../interfaces';
import { CrudConfigService } from '../module/crud-config.service';
import { getAllowedColumns as getAllowedColumnsUtil } from '../util/get-allowed-columns';

export abstract class CrudService<T> {
  throwBadRequestException(msg?: unknown): BadRequestException {
    throw new BadRequestException(msg);
  }

  throwNotFoundException(name: string): NotFoundException {
    throw new NotFoundException(`${name} not found`);
  }

  /**
   * Wrap page into page-info
   * override this method to create custom page-info response
   * or set custom `serialize.getMany` dto in the controller's CrudOption
   * @param data
   * @param total
   * @param limit
   * @param offset
   */
  createPageInfo(data: T[], total: number, limit: number, offset: number): GetManyDefaultResponse<T> {
    return {
      data,
      count: data.length,
      total,
      page: limit ? Math.floor(offset / limit) + 1 : 1,
      pageCount: limit && total ? Math.ceil(total / limit) : 1,
    };
  }

  /**
   * Determine if need paging
   * @param parsed
   * @param options
   */
  decidePagination(parsed: ParsedRequestParams, options: CrudRequestOptions): boolean {
    return (
      options.query.alwaysPaginate ||
      ((Number.isFinite(parsed.page) || Number.isFinite(parsed.offset)) &&
        /* istanbul ignore next */ !!this.getTake(parsed, options.query))
    );
  }

  /**
   * Get number of resources to be fetched
   * @param query
   * @param options
   */
  getTake(query: ParsedRequestParams, options: QueryOptions): number | null {
    if (query.limit) {
      return options.maxLimit ? (query.limit <= options.maxLimit ? query.limit : options.maxLimit) : query.limit;
    }
    /* istanbul ignore if */
    if (options.limit) {
      return options.maxLimit ? (options.limit <= options.maxLimit ? options.limit : options.maxLimit) : options.limit;
    }

    return options.maxLimit ? options.maxLimit : null;
  }

  /**
   * Get number of resources to be skipped
   * @param query
   * @param take
   */
  getSkip(query: ParsedRequestParams, take: number): number | null {
    return query.page && take ? take * (query.page - 1) : query.offset ? query.offset : null;
  }

  /**
   * Get primary param name from CrudOptions
   * @param options
   */
  getPrimaryParams(options: CrudRequestOptions): string[] {
    const params = objKeys(options.params).filter((n) => options.params[n] && options.params[n].primary);

    return params.map((p) => options.params[p].field);
  }

  protected getAllowedColumns(columns: string[], options: QueryOptions): string[] {
    return getAllowedColumnsUtil(columns, options);
  }

  /**
   * Resolve the effective `strictSanitization` flag for this service.
   *
   * v2.0 reads the global `CrudConfigService.config.strictSanitization` only
   * (per-service override via `@Crud()` metadata is type-surface only and
   * wired in v2.1). Defaults to `true` when unset.
   *
   * @since 2.0.0
   */
  protected resolveStrictSanitization(): boolean {
    const global = CrudConfigService.config.strictSanitization;
    return typeof global === 'boolean' ? global : true;
  }

  abstract getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]>;

  abstract getOne(req: CrudRequest): Promise<T>;

  abstract createOne(req: CrudRequest, dto: T | Partial<T>): Promise<T>;

  abstract createMany(req: CrudRequest, dto: CreateManyDto): Promise<T[]>;

  abstract updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T>;

  abstract replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T>;

  abstract deleteOne(req: CrudRequest): Promise<void | T>;

  abstract recoverOne(req: CrudRequest): Promise<void | T>;
}
