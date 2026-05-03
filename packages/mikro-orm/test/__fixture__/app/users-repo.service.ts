import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';

import { MikroOrmCrudService } from '../../../src/mikro-orm-crud.service';
import { User } from '../entities';

@Injectable()
export class UsersRepoService extends MikroOrmCrudService<User> {
  constructor(@InjectRepository(User) public usersRepo: EntityRepository<User>) {
    // Pass the repository directly — MikroOrmCrudService's ctor accepts
    // EntityManager | EntityRepository<T> and unwraps via repo.getEntityManager().
    // The unwrapped em is the SAME ALS-backed proxy MikroORM injects, so
    // request-scope identity-map isolation is preserved.
    super(usersRepo, User);
  }
}
