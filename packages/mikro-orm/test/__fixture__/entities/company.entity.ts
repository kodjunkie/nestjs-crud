import { Collection, Entity, OneToMany, PrimaryKey, Property } from '@mikro-orm/core';

import type { Project } from './project.entity';
import type { User } from './user.entity';

@Entity({ tableName: 'companies' })
export class Company {

  @PrimaryKey()
  id!: number;

  @Property({ length: 255 })
  name!: string;

  @Property({ length: 255, unique: true })
  domain!: string;

  @Property({ length: 500, nullable: true })
  description?: string | null;

  @OneToMany('User', 'company')
  users = new Collection<User>(this);

  @OneToMany('Project', 'company')
  projects = new Collection<Project>(this);

}
