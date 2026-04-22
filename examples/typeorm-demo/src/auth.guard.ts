import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { USER_REQUEST_KEY } from './constants';
import { User } from './users/user.entity';

/**
 * Minimal demo auth stub — stamps a user onto the request so `@CrudAuth()`
 * filter/persist hooks have something to key off. Not a real auth guard.
 *
 * NOTE: The v0.2 TypeORM API was `repo.findOne(id: number)`. TypeORM v0.3
 * deleted that signature — the v0.3 replacement is `findOneBy({ id })`
 * (`Repository<T>.findOneBy(where: FindOptionsWhere<T>): Promise<T | null>`).
 * Fixing that here is one of the reasons this demo was extracted from the
 * old `integration/typeorm/` directory — see D-03 in 06-CONTEXT.md.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = await this.repo.findOneBy({ id: 1 });
    req[USER_REQUEST_KEY] = user;

    return true;
  }
}
