import { Logger } from '@nestjs/common';

import { CrudConfigService, CrudService } from '@nestjs-crud/core';

import type { CacheStrategy } from '@nestjs-crud/core/cache';

import type { CreateManyDto, CrudRequest, GetManyDefaultResponse } from '@nestjs-crud/core';

import { PrismaClientLike, PrismaQueryTranslatorConfig } from './interfaces';

import { PrismaQueryTranslator } from './prisma-query-translator';

export interface PrismaCrudServiceConfig<T> extends PrismaQueryTranslatorConfig<T> {
  // Optional logger (Prisma uses serviceConfig.logger — asymmetry from TypeORM/Drizzle/MikroORM per CLAUDE.md)
  logger?: {
    error: (msg: string, trace?: string) => void;
    warn?: (msg: string) => void;
    debug?: (msg: string) => void;
  };
  /** Optional cache backend. When set, reads are wrapped and writes call invalidate. */
  cacheStrategy?: CacheStrategy;
}

export class PrismaCrudService<T extends Record<string, unknown>> extends CrudService<T> {
  protected readonly translator: PrismaQueryTranslator<T>;

  constructor(
    protected readonly prisma: PrismaClientLike,
    protected readonly modelName: string,
    protected readonly serviceConfig: PrismaCrudServiceConfig<T>,
  ) {
    super();
    if (!this.serviceConfig.logger) {
      // Default to NestJS Logger when omitted — parity with TypeORM/Drizzle/MikroORM adapters.
      // Logger from '@nestjs/common' structurally satisfies { error, warn?, debug? }.
      this.serviceConfig.logger = new Logger(PrismaCrudService.name);
    }
    this.translator = new PrismaQueryTranslator<T>(prisma, modelName, {
      ...this.serviceConfig,
      cacheStrategy: this._resolveCacheStrategy(),
      entityName: this.modelName,
      logger: this.serviceConfig.logger as any,
    } as any);
  }

  // === PUBLIC CRUD VERBS ===

  public async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    try {
      const { parsed, options } = req;
      const q = this.translator.applyToQuery(this.translator.newQuery(), parsed, options);

      if (this.decidePagination(parsed, options)) {
        const take = this.getTake(parsed, options.query);
        const skip = this.getSkip(parsed, take as number);
        const delegate = this.getDelegate();
        const [total, data] = await Promise.all([
          delegate.count({ where: q.where }),
          this.translator.executeMany<T>(q, parsed, options),
        ]);
        return this.createPageInfo(data as T[], total, take || total, skip || 0);
      }

      return (await this.translator.executeMany<T>(q, parsed, options)) as T[];
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.getMany failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  public async getOne(req: CrudRequest): Promise<T> {
    return this.getOneOrFail(req);
  }

  public async createOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    try {
      const data = this.prepareForSave(dto, req);
      const result = (await this.getDelegate().create({ data })) as T;
      await this._invalidateCache();
      return result;
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.createOne failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  public async createMany(req: CrudRequest, dto: CreateManyDto): Promise<T[]> {
    try {
      const bulk = dto.bulk ?? [];
      if (!bulk.length) {
        return [];
      }
      // Array form — Prisma native createMany returns {count} only; array form returns full records
      const result = (await this.prisma.$transaction([
        ...bulk.map((d) => this.getDelegate().create({ data: this.prepareForSave(d as T | Partial<T>, req) })),
      ])) as T[];
      await this._invalidateCache();
      return result;
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.createMany failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  public async updateOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    try {
      const result = await this.prisma.$transaction(
        async (tx: any) => {
          const txTranslator = this.translator.cloneFor(tx);
          const q = txTranslator.applyToQuery(txTranslator.newQuery(), req.parsed, req.options);
          q.where = this.mergePrimaryParamsIntoWhere(q.where ?? {}, req);
          const current = await tx[this.modelName].findFirst({ where: q.where });
          if (!current) {
            this.throwNotFoundException(this.modelName);
          }
          const merged = { ...current, ...dto, ...this.getAuthPersist(req) };
          const updated = await tx[this.modelName].update({ where: this.buildPkWhere(current), data: merged });
          return updated as T;
        },
        { isolationLevel: 'ReadCommitted' },
      );
      await this._invalidateCache();
      return result;
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.updateOne failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  public async replaceOne(req: CrudRequest, dto: T | Partial<T>): Promise<T> {
    try {
      const result = await this.prisma.$transaction(
        async (tx: any) => {
          const txTranslator = this.translator.cloneFor(tx);
          const q = txTranslator.applyToQuery(txTranslator.newQuery(), req.parsed, req.options);
          q.where = this.mergePrimaryParamsIntoWhere(q.where ?? {}, req);
          const current = await tx[this.modelName].findFirst({ where: q.where });
          if (!current) {
            this.throwNotFoundException(this.modelName);
          }
          const merged = { ...dto, ...this.getAuthPersist(req) };
          const updated = await tx[this.modelName].update({ where: this.buildPkWhere(current), data: merged });
          return updated as T;
        },
        { isolationLevel: 'ReadCommitted' },
      );
      await this._invalidateCache();
      return result;
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.replaceOne failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  public async deleteOne(req: CrudRequest): Promise<void | T> {
    try {
      const result = await this.prisma.$transaction(
        async (tx: any) => {
          const txTranslator = this.translator.cloneFor(tx);
          const q = txTranslator.applyToQuery(txTranslator.newQuery(), req.parsed, req.options);
          q.where = this.mergePrimaryParamsIntoWhere(q.where ?? {}, req);
          const current = await tx[this.modelName].findFirst({ where: q.where });
          if (!current) {
            this.throwNotFoundException(this.modelName);
          }
          if (req.options.query?.softDelete && this.serviceConfig.softDeleteColumn) {
            return (await tx[this.modelName].update({
              where: this.buildPkWhere(current),
              data: { [this.serviceConfig.softDeleteColumn]: new Date() },
            })) as T;
          }
          await tx[this.modelName].delete({ where: this.buildPkWhere(current) });
          return req.options.routes?.deleteOneBase?.returnDeleted ? (current as T) : undefined;
        },
        { isolationLevel: 'ReadCommitted' },
      );
      await this._invalidateCache();
      return result;
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.deleteOne failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  public async recoverOne(req: CrudRequest): Promise<void | T> {
    // Transaction-wrap EXCLUSION: single write, no prior read, no race window.
    // recoverOne is NOT wrapped in $transaction.
    try {
      const softDel = this.serviceConfig.softDeleteColumn;
      if (!softDel) {
        return undefined;
      }
      const where = this.mergePrimaryParamsIntoWhere({}, req);
      const recovered = (await this.getDelegate().update({ where, data: { [softDel]: null } })) as T;
      await this._invalidateCache();
      return recovered;
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.recoverOne failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  // === PROTECTED HELPERS (must come before private methods per ESLint member-ordering) ===

  /**
   * Resolve the effective cache strategy at request time.
   * Priority: serviceConfig field > CrudConfigService global > undefined.
   * Called at request time so `CrudConfigService.load(...)` after app bootstrap works.
   */
  protected _resolveCacheStrategy(): CacheStrategy | undefined {
    return this.serviceConfig.cacheStrategy ?? CrudConfigService.config.query?.cacheStrategy;
  }

  protected getDelegate(): any {
    return (this.prisma as any)[this.modelName];
  }

  protected buildPkWhere(entity: Record<string, any>): Record<string, any> {
    const where: Record<string, any> = {};
    for (const pk of this.serviceConfig.entityPrimaryColumns) {
      where[pk] = entity[pk];
    }
    return where;
  }

  protected mergePrimaryParamsIntoWhere(where: Record<string, any>, req: CrudRequest): Record<string, any> {
    const merged = { ...where };
    if (req.parsed?.paramsFilter?.length) {
      for (const f of req.parsed.paramsFilter) {
        merged[f.field] = f.value;
      }
    }
    return merged;
  }

  protected prepareForSave(dto: T | Partial<T>, req: CrudRequest): Record<string, any> {
    const entity: Record<string, any> = { ...(dto as Record<string, any>) };
    if (req.parsed?.paramsFilter?.length) {
      for (const f of req.parsed.paramsFilter) {
        entity[f.field] = f.value;
      }
    }
    if (req.parsed?.authPersist) {
      Object.assign(entity, req.parsed.authPersist);
    }
    return entity;
  }

  protected getAuthPersist(req: CrudRequest): Record<string, any> {
    return req.parsed?.authPersist ?? {};
  }

  protected async getOneOrFail(req: CrudRequest): Promise<T> {
    try {
      const { parsed, options } = req;
      const q = this.translator.applyToQuery(this.translator.newQuery(), parsed, options);
      q.where = this.mergePrimaryParamsIntoWhere(q.where ?? {}, req);
      // Route through translator.findOneOrFail so the cache wrap path is honoured.
      const row = await this.translator.findOneOrFail<T>(q, parsed, options);
      if (!row) {
        this.throwNotFoundException(this.modelName);
      }
      return row as T;
    } catch (err: any) {
      this.serviceConfig.logger.error(`PrismaCrudService.getOne failed: ${err.name}`, err.stack);
      throw err;
    }
  }

  // === PRIVATE HELPERS ===

  /**
   * Invalidate all cache entries for this entity after a successful write.
   * Errors are logged and swallowed — cache invalidation failure must NOT
   * take the write path offline.
   */
  private async _invalidateCache(): Promise<void> {
    const strategy = this._resolveCacheStrategy();
    if (!strategy) return;
    try {
      await strategy.invalidate(`${this.modelName}:`);
    } catch (err) {
      this.serviceConfig.logger?.warn?.(
        `CacheStrategy.invalidate failed for ${this.modelName}: ${err instanceof Error ? err.name : 'UnknownError'}`,
      );
    }
  }
}
