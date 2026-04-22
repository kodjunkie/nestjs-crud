import { Entity, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core';

import { Company } from './company.entity';

@Entity({ tableName: 'users' })
export class User {

  @PrimaryKey()
  id!: number;

  @Unique()
  @Property({ length: 255 })
  email!: string;

  @Property({ length: 255 })
  password!: string;

  @Property({ fieldName: 'name_first', length: 255 })
  nameFirst!: string;

  @Property({ fieldName: 'name_last', length: 255 })
  nameLast!: string;

  @Property({ default: true })
  isActive!: boolean;

  @ManyToOne(() => Company, { fieldName: 'company_id' })
  company!: Company;

  @Property({ fieldName: 'profile_id', nullable: true })
  profileId?: number | null;

  @Property({ fieldName: 'deleted_at', nullable: true })
  deletedAt?: Date | null;

}
