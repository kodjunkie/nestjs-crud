/**
 * Plan 15-01 regression spec: PrismaCrudService ctor default logger.
 *
 * Pins:
 *   1. Omitted `serviceConfig.logger` → auto-instantiated `Logger` instance.
 *   2. Consumer-supplied logger preserved by identity (no override).
 *   3. Translator constructed successfully with populated logger (no throw).
 *
 * Pure unit spec — no live Prisma client; mockPrisma is an empty shim.
 */

import { Logger } from '@nestjs/common';

import { PrismaCrudService, PrismaCrudServiceConfig } from '../src/prisma-crud.service';
import { PrismaJoinResolver } from '../src/prisma-join-resolver';

function makeBaseConfig(): PrismaCrudServiceConfig<any> {
  const joinResolver = new PrismaJoinResolver({
    relationFields: [],
    allowedColumnsByRelation: {},
  });

  return {
    entityColumns: ['id', 'name'],
    entityPrimaryColumns: ['id'],
    entityHasDeleteColumn: false,
    softDeleteColumn: null,
    onBadRequest: (msg: string) => {
      throw new Error(msg);
    },
    joinResolver,
    relationFields: [],
  } as PrismaCrudServiceConfig<any>;
}

describe('PrismaCrudService — default logger', () => {
  const mockPrisma: any = {};

  it('auto-instantiates new Logger(PrismaCrudService.name) when serviceConfig.logger is omitted', () => {
    const service = new PrismaCrudService<any>(mockPrisma, 'user', makeBaseConfig());
    const assigned = (service as any).serviceConfig.logger;
    expect(assigned).toBeInstanceOf(Logger);
  });

  it('preserves a consumer-supplied logger by identity', () => {
    const custom = { error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    const service = new PrismaCrudService<any>(mockPrisma, 'user', { ...makeBaseConfig(), logger: custom });
    expect((service as any).serviceConfig.logger).toBe(custom);
  });

  it('populates the logger BEFORE constructing the translator (translator exists)', () => {
    const service = new PrismaCrudService<any>(mockPrisma, 'user', makeBaseConfig());
    expect((service as any).translator).toBeDefined();
  });
});
