import { sql } from 'drizzle-orm';

import {
  CANONICAL_SEED_COMPANIES,
  CANONICAL_SEED_USERS,
  CANONICAL_SEED_PROJECTS,
} from '../../../core/test/__shared-fixture__/canonical-entities';

import * as pgSchema from './schema.postgres';
import * as mysqlSchema from './schema.mysql';

export async function seedAll(db: any, dialect: 'postgres' | 'mysql'): Promise<void> {
  const schema = dialect === 'postgres' ? pgSchema : mysqlSchema;
  const { companies, users, projects } = schema;

  // --- Schema bootstrap (idempotent) ---
  // Drizzle has no migration step in this fixture; CI cells run in isolation,
  // so we cannot assume TypeORM has created tables first. CREATE TABLE IF NOT EXISTS
  // is safe to run on every seed invocation.
  if (dialect === 'postgres') {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        domain VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        "deletedAt" TIMESTAMP
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        "nameFirst" VARCHAR(255),
        "nameLast" VARCHAR(255),
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "companyId" INTEGER NOT NULL REFERENCES companies(id),
        "profileId" INTEGER,
        "deletedAt" TIMESTAMP
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
        "companyId" INTEGER NOT NULL REFERENCES companies(id)
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_projects (
        "projectId" INTEGER NOT NULL,
        "userId" INTEGER NOT NULL,
        review VARCHAR(255),
        PRIMARY KEY ("projectId", "userId")
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_licenses (
        "userId" INTEGER NOT NULL,
        "licenseId" INTEGER NOT NULL,
        "yearsActive" INTEGER NOT NULL,
        PRIMARY KEY ("userId", "licenseId")
      );
    `);
  } else {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        domain VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        deletedAt DATETIME NULL
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        nameFirst VARCHAR(255) NULL,
        nameLast VARCHAR(255) NULL,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        companyId INT NOT NULL,
        profileId INT NULL,
        deletedAt DATETIME NULL,
        CONSTRAINT fk_users_company FOREIGN KEY (companyId) REFERENCES companies(id)
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS projects (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        isActive BOOLEAN NOT NULL DEFAULT TRUE,
        companyId INT NOT NULL,
        CONSTRAINT fk_projects_company FOREIGN KEY (companyId) REFERENCES companies(id)
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_projects (
        projectId INT NOT NULL,
        userId INT NOT NULL,
        review VARCHAR(255) NULL,
        PRIMARY KEY (projectId, userId)
      );
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS user_licenses (
        userId INT NOT NULL,
        licenseId INT NOT NULL,
        yearsActive INT NOT NULL,
        PRIMARY KEY (userId, licenseId)
      );
    `);
  }

  if (dialect === 'mysql') {
    await db.execute('SET FOREIGN_KEY_CHECKS = 0');
    await db.execute('TRUNCATE TABLE user_licenses');
    await db.execute('TRUNCATE TABLE user_projects');
    await db.execute('TRUNCATE TABLE projects');
    await db.execute('TRUNCATE TABLE users');
    await db.execute('TRUNCATE TABLE companies');
    await db.execute('SET FOREIGN_KEY_CHECKS = 1');
  } else {
    // TRUNCATE with CASCADE + RESTART IDENTITY ensures FK-dependent TypeORM tables are
    // cleared and serial sequences are reset so canonical IDs (1-10) are reproducible.
    await db.execute(
      'TRUNCATE TABLE user_licenses, user_projects, projects, users, companies RESTART IDENTITY CASCADE',
    );
  }

  await db.insert(companies).values(CANONICAL_SEED_COMPANIES.map((c) => ({ ...c })));
  await db.insert(users).values(CANONICAL_SEED_USERS.map((u) => ({ ...u })));
  await db.insert(projects).values(CANONICAL_SEED_PROJECTS.map((p) => ({ ...p })));

  console.log(
    `[seeds] seeded ${CANONICAL_SEED_COMPANIES.length} companies, ${CANONICAL_SEED_USERS.length} users, ${CANONICAL_SEED_PROJECTS.length} projects (${dialect})`,
  );
}

if (require.main === module) {
  const dialect = process.argv[2] as 'postgres' | 'mysql';

  if (dialect !== 'postgres' && dialect !== 'mysql') {
    console.error('Usage: ts-node seeds.ts <postgres|mysql>');
    process.exit(1);
  }

  const { createPostgresClient } = require('./db.postgres');
  const { createMysqlClient } = require('./db.mysql');
  const db = dialect === 'postgres' ? createPostgresClient() : createMysqlClient();

  seedAll(db, dialect)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
