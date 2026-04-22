import { Inject, Injectable } from '@nestjs/common';

import { DrizzleCrudService } from '../../../src/drizzle-crud.service';

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

export const DRIZZLE_TABLE = Symbol('DRIZZLE_TABLE');

@Injectable()
export class UsersService extends DrizzleCrudService<Record<string, unknown>> {

  constructor(
    @Inject(DRIZZLE_DB) db: any,
    @Inject(DRIZZLE_TABLE) table: any,
  ) {
    super(db, table);
  }
}
