import { CrudService } from '@nestjs-crud/core';

import type { CreateManyDto, CrudRequest, GetManyDefaultResponse } from '@nestjs-crud/core';

import { PrismaClientLike, PrismaQueryTranslatorConfig } from './interfaces';

import { PrismaQueryTranslator } from './prisma-query-translator';

export interface PrismaCrudServiceConfig<T> extends PrismaQueryTranslatorConfig<T> {
  // OBS-01 optional logger
  logger?: { error: (msg: string, trace?: string) => void };
}

export class PrismaCrudService<T extends Record<string, unknown>> extends CrudService<T> {
  protected readonly translator: PrismaQueryTranslator<T>;

  constructor(
    protected readonly prisma: PrismaClientLike,
    protected readonly modelName: string,
    protected readonly serviceConfig: PrismaCrudServiceConfig<T>,
  ) {
    super();
    this.translator = new PrismaQueryTranslator<T>(prisma, modelName, serviceConfig);
  }

  public async getMany(_req: CrudRequest): Promise<GetManyDefaultResponse<T> | T[]> {
    throw new Error('not implemented — Plan 04');
  }

  public async getOne(_req: CrudRequest): Promise<T> {
    throw new Error('not implemented — Plan 04');
  }

  public async createOne(_req: CrudRequest, _dto: T | Partial<T>): Promise<T> {
    throw new Error('not implemented — Plan 04');
  }

  public async createMany(_req: CrudRequest, _dto: CreateManyDto): Promise<T[]> {
    throw new Error('not implemented — Plan 04');
  }

  public async updateOne(_req: CrudRequest, _dto: T | Partial<T>): Promise<T> {
    throw new Error('not implemented — Plan 04');
  }

  public async replaceOne(_req: CrudRequest, _dto: T | Partial<T>): Promise<T> {
    throw new Error('not implemented — Plan 04');
  }

  public async deleteOne(_req: CrudRequest): Promise<void | T> {
    throw new Error('not implemented — Plan 04');
  }

  public async recoverOne(_req: CrudRequest): Promise<void | T> {
    throw new Error('not implemented — Plan 04');
  }
}
