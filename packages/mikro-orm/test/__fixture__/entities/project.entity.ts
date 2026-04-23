import { EntitySchema } from '@mikro-orm/core';

import { Company } from './company.entity';

export class Project {
  id!: number;

  name!: string;

  description?: string | null;

  company!: Company;

  isActive!: boolean;
}

export const ProjectSchema = new EntitySchema<Project>({
  class: Project,
  tableName: 'projects',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string', length: 255 },
    description: { type: 'string', length: 500, nullable: true },
    company: {
      kind: 'm:1',
      entity: () => Company,
      fieldName: 'company_id',
    },
    isActive: { type: 'boolean', default: true },
  },
});
