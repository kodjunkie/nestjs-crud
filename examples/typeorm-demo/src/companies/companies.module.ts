import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Company } from './company.entity';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  providers: [CompaniesService],
  exports: [CompaniesService],
  controllers: [CompaniesController],
})
export class CompaniesModule {}
