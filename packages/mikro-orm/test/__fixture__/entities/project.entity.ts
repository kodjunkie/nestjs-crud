import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core';

import { Company } from './company.entity';

@Entity({ tableName: 'projects' })
export class Project {
  @PrimaryKey()
  id!: number;

  @Property({ length: 255 })
  name!: string;

  @Property({ length: 500, nullable: true })
  description?: string | null;

  @ManyToOne(() => Company, { fieldName: 'company_id' })
  company!: Company;

  @Property({ default: true })
  isActive!: boolean;
}
