import { Inject, Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';

import { PrismaCrudService } from '../../../src/prisma-crud.service';
import { PrismaJoinResolver } from '../../../src/prisma-join-resolver';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

@Injectable()
export class UsersService extends PrismaCrudService<Record<string, unknown>> {
  constructor(@Inject(PRISMA_CLIENT) prismaClient: any) {
    const joinResolver = new PrismaJoinResolver({
      relationFields: ['company'],
      allowedColumnsByRelation: { company: ['id', 'name', 'domain', 'description'] },
    });

    super(prismaClient, 'user', {
      entityColumns: [
        'id',
        'email',
        'password',
        'nameFirst',
        'nameLast',
        'isActive',
        'companyId',
        'profileId',
        'deletedAt',
      ],
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: true,
      softDeleteColumn: 'deletedAt',
      onBadRequest: (msg: string) => {
        throw new BadRequestException(msg);
      },
      joinResolver,
    });
  }
}
