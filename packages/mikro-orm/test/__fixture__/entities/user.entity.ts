import { EntitySchema } from '@mikro-orm/core';

import { Company } from './company.entity';

export class User {
  id!: number;

  email!: string;

  password!: string;

  nameFirst!: string;

  nameLast!: string;

  isActive!: boolean;

  company!: Company;

  profileId?: number | null;

  deletedAt?: Date | null;
}

export const UserSchema = new EntitySchema<User>({
  class: User,
  tableName: 'users',
  properties: {
    id: { primary: true, type: 'number' },
    email: { type: 'string', length: 255, unique: true },
    password: { type: 'string', length: 255 },
    nameFirst: { type: 'string', length: 255, fieldName: 'name_first' },
    nameLast: { type: 'string', length: 255, fieldName: 'name_last' },
    isActive: { type: 'boolean', default: true },
    company: {
      kind: 'm:1',
      entity: () => Company,
      fieldName: 'company_id',
    },
    profileId: { type: 'number', fieldName: 'profile_id', nullable: true },
    deletedAt: { type: 'Date', fieldName: 'deleted_at', nullable: true },
  },
});
