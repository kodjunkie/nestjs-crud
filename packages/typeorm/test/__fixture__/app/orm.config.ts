import { join } from 'path';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { isNil } from '@nestjs-crud/util';

const type = (process.env.TYPEORM_CONNECTION as any) || 'postgres';

export const withCache: TypeOrmModuleOptions = {
  type,
  host: '127.0.0.1',
  port: type === 'postgres' ? 5455 : 3316,
  username: type === 'mysql' ? 'nestjs_crud' : 'root',
  password: type === 'mysql' ? 'nestjs_crud' : 'root',
  database: 'nestjs_crud',
  synchronize: false,
  logging: !isNil(process.env.TYPEORM_LOGGING) ? !!parseInt(process.env.TYPEORM_LOGGING, 10) : true,
  entities: [join(__dirname, './**/*.entity{.ts,.js}')],
};
