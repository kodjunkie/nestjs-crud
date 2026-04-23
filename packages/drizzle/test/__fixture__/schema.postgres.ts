// Column names match the TypeORM-created table (camelCase, no snake_case mapping).
// TypeORM by default uses the JS property name as the SQL column name.
import { pgTable, serial, varchar, integer, boolean, timestamp, text } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  domain: varchar('domain', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
  deletedAt: timestamp('deletedAt').default(null),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  nameFirst: varchar('nameFirst').default(null),
  nameLast: varchar('nameLast').default(null),
  isActive: boolean('isActive').notNull().default(true),
  companyId: integer('companyId')
    .notNull()
    .references(() => companies.id),
  profileId: integer('profileId').default(null),
  deletedAt: timestamp('deletedAt').default(null),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
  isActive: boolean('isActive').notNull().default(true),
  companyId: integer('companyId')
    .notNull()
    .references(() => companies.id),
});

export type Schema = {
  users: typeof users;
  companies: typeof companies;
  projects: typeof projects;
};
