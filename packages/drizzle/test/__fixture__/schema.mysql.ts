import { mysqlTable, int, varchar, boolean, datetime, text } from 'drizzle-orm/mysql-core';

export const companies = mysqlTable('companies', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  domain: varchar('domain', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
});

export const users = mysqlTable('users', {
  id: int('id').autoincrement().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull().default('secret'),
  nameFirst: varchar('name_first', { length: 255 }).default(null),
  nameLast: varchar('name_last', { length: 255 }).default(null),
  isActive: boolean('is_active').notNull().default(true),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id),
  profileId: int('profile_id').default(null),
  deletedAt: datetime('deleted_at').default(null),
});

export const projects = mysqlTable('projects', {
  id: int('id').autoincrement().primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
  isActive: boolean('is_active').notNull().default(true),
  companyId: int('company_id')
    .notNull()
    .references(() => companies.id),
});

export type Schema = {
  users: typeof users;
  companies: typeof companies;
  projects: typeof projects;
};
