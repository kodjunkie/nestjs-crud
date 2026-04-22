import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';

import { MikroOrmCrudService } from '../../../src/mikro-orm-crud.service';
import { User } from '../entities';

@Injectable()
export class UsersService extends MikroOrmCrudService<User> {
  constructor(em: EntityManager) {
    // T-06-02: pass `em` directly to super — MikroOrmCrudService stores it as
    // `this.em` and internally uses `() => this.em` thunk when wiring the translator.
    // MikroOrmModule middleware forks a per-request em and stores it in AsyncLocalStorage;
    // the DI-injected em proxy resolves to that forked em on every call, so identity-map
    // isolation is preserved across requests without any extra effort here.
    super(em, User);
  }
}
