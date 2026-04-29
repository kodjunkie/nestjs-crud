import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from '../entities';
import { UsersRepoService } from './users-repo.service';

@Crud({
  model: { type: User },
  serviceProperty: 'usersRepo',
})
@Controller('users-repo')
export class UsersRepoController {
  constructor(public usersRepo: UsersRepoService) {}
}
