import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from '../entities';
import { UsersService } from './users.service';

@Crud({
  model: { type: User },
  query: { softDelete: true },
  routes: { deleteOneBase: { returnDeleted: true } },
})
@Controller('users')
export class UsersController {
  constructor(public service: UsersService) {}
}
