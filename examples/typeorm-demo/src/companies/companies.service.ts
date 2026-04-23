import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmCrudService } from '@nestjs-crud/typeorm';
import { Repository } from 'typeorm';

import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends TypeOrmCrudService<Company> {
  constructor(@InjectRepository(Company) repo: Repository<Company>) {
    super(repo);
  }
}
