// Column names match the TypeORM-created table (camelCase, no snake_case mapping).
// TypeORM by default uses the JS property name as the SQL column name.
import { mysqlTable, int, varchar, boolean, datetime, text } from 'drizzle-orm/mysql-core';

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  domain: varchar('domain', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
  deletedAt: datetime('deletedAt').default(null),
});

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  nameFirst: varchar('nameFirst', { length: 255 }).default(null),
  nameLast: varchar('nameLast', { length: 255 }).default(null),
  isActive: boolean('isActive').notNull().default(true),
  companyId: int('companyId')
    .notNull()
    .references(() => companies.id),
  profileId: int('profileId').default(null),
  deletedAt: datetime('deletedAt').default(null),
});

export const projects = mysqlTable('projects', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
  isActive: boolean('isActive').notNull().default(true),
  companyId: int('companyId')
    .notNull()
    .references(() => companies.id),
});

export type Schema = {
  users: typeof users;
  companies: typeof companies;
  projects: typeof projects;
};
