import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@nestjs-crud/core';

import { User } from './user.entity';
import { UsersService } from './users.service';

@Crud({
  model: {
    type: User,
  },
  query: {
    softDelete: true,
    join: {
      company: {
        exclude: ['description'],
      },
    },
  },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
