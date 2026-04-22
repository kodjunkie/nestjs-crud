import { CrudValidationGroups } from '@nestjs-crud/core';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Column, DeleteDateColumn, Entity, OneToMany } from 'typeorm';

import { BaseEntity } from '../base-entity';
import { User } from '../users/user.entity';

const { CREATE, UPDATE } = CrudValidationGroups;

@Entity('companies')
export class Company extends BaseEntity {
  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @MaxLength(100, { always: true })
  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @MaxLength(100, { always: true })
  @Column({ type: 'varchar', length: 100, nullable: false, unique: true })
  domain: string;

  @IsOptional({ always: true })
  @IsString({ always: true })
  @Column({ type: 'text', nullable: true, default: null })
  description: string;

  @DeleteDateColumn({ nullable: true })
  deletedAt?: Date;

  @OneToMany(() => User, (u) => u.company)
  users?: User[];
}
