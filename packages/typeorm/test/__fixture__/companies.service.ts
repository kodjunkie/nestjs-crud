import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { TypeOrmCrudService } from '../../../typeorm/src/typeorm-crud.service';
import { Company } from './app/companies';

@Injectable()
export class CompaniesService extends TypeOrmCrudService<Company> {
  constructor(@InjectRepository(Company) repo) {
    super(repo);
  }
}
