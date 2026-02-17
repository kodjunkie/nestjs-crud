import { DataSource } from 'typeorm';

exports.default = new DataSource({
  type: 'mysql',
  host: '127.0.0.1',
  port: 3316,
  username: 'nestjs_crud',
  password: 'nestjs_crud',
  database: 'nestjs_crud',
  entities: ['./**/*.entity.ts'],
  migrationsTableName: 'orm_migrations',
  migrations: ['./seeds.ts'],
});
