import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

@Crud({
  model: { type: UserModel },
  query: { softDelete: true },
  routes: { deleteOneBase: { returnDeleted: true } },
})
@Controller('users')
export class UsersController {
  constructor(public service: UsersService) {}
}
