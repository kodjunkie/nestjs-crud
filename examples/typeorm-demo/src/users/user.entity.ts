import { CrudValidationGroups } from '@nestjs-crud/core';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Column, DeleteDateColumn, Entity, ManyToOne } from 'typeorm';

import { BaseEntity } from '../base-entity';
import { Company } from '../companies/company.entity';

const { CREATE, UPDATE } = CrudValidationGroups;

@Entity('users')
export class User extends BaseEntity {
  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @MaxLength(255, { always: true })
  @IsEmail({ require_tld: false }, { always: true })
  @Column({ type: 'varchar', length: 255, nullable: false, unique: true })
  email: string;

  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @MaxLength(100, { always: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string;

  @IsOptional({ always: true })
  @IsBoolean({ always: true })
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ nullable: true })
  companyId?: number;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @ManyToOne(() => Company, (c) => c.users)
  company?: Company;
}
