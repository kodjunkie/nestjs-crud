import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UsersService } from './users.service';

class UserModel {
  id!: number;

  email!: string;

  isActive!: boolean;

  deletedAt?: Date | null;
}

@Crud({
  model: { type: UserModel },
  query: { softDelete: true },
  routes: { deleteOneBase: { returnDeleted: true } },
})
@Controller('users')
export class UsersController {
  constructor(public service: UsersService) {}
}
