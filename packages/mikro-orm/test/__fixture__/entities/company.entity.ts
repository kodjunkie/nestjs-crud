import { EntitySchema } from '@mikro-orm/core';

export class Company {
  id!: number;

  name!: string;

  domain!: string;

  description?: string | null;
}

export const CompanySchema = new EntitySchema<Company>({
  class: Company,
  tableName: 'companies',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string', length: 255 },
    domain: { type: 'string', length: 255, unique: true },
    description: { type: 'string', length: 500, nullable: true },
  },
});
