import { Inject, Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { PrismaCrudService } from '../../../src/prisma-crud.service';
import { PrismaJoinResolver } from '../../../src/prisma-join-resolver';

import { UserModel } from './user-model';
import { PRISMA_CLIENT } from './users.service';

/**
 * Fixture service for the offset-mode route-default-sort spec.
 *
 * Same shape as `UsersService`, but also declares `relationFields: ['company']`
 * on the service config so the composer's `include` branch can build
 * `include.company` for the non-eager join option on the sibling controller
 * below.
 */
@Injectable()
export class UsersRouteDefaultsService extends PrismaCrudService<Record<string, unknown>> {
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
      relationFields: ['company'],
    });
  }
}

/**
 * Fixture controller for the offset-mode route-default-sort integration spec.
 *
 * Mounted at `/users-route-defaults`. Declares a single-field default sort
 * (`id` DESC) via `@Crud({ query: { sort } } })`, so an offset-mode request
 * with no `?sort=` resolves to this route default instead of database order.
 * The `company` join option is non-eager on purpose — a later eager-include
 * fix asserts the response shape on this same route.
 */
@Crud({
  model: { type: UserModel },
  query: { sort: [{ field: 'id', order: 'DESC' }], join: { company: {} } },
})
@Controller('users-route-defaults')
export class UsersRouteDefaultsController {
  constructor(public service: UsersRouteDefaultsService) {}
}
