import { pgTable, serial, varchar, integer, boolean, timestamp, text } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  domain: varchar('domain', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull().default('secret'),
  nameFirst: varchar('name_first', { length: 255 }).default(null),
  nameLast: varchar('name_last', { length: 255 }).default(null),
  isActive: boolean('is_active').notNull().default(true),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
  profileId: integer('profile_id').default(null),
  deletedAt: timestamp('deleted_at', { withTimezone: true }).default(null),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull().unique(),
  description: text('description').default(null),
  isActive: boolean('is_active').notNull().default(true),
  companyId: integer('company_id')
    .notNull()
    .references(() => companies.id),
});

export type Schema = {
  users: typeof users;
  companies: typeof companies;
  projects: typeof projects;
};
