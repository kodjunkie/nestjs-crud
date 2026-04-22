import { join } from 'path';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const type = (process.env.TYPEORM_CONNECTION as any) || 'postgres';

export const ormConfig: TypeOrmModuleOptions = {
  type,
  host: process.env.TYPEORM_HOST || '127.0.0.1',
  port: type === 'postgres' ? 5455 : 3316,
  username: type === 'mysql' ? 'nestjs_crud' : 'root',
  password: type === 'mysql' ? 'nestjs_crud' : 'root',
  database: 'nestjs_crud',
  // synchronize: true so the demo creates its two tables on first boot.
  synchronize: true,
  logging: false,
  entities: [join(__dirname, './**/*.entity{.ts,.js}')],
};
