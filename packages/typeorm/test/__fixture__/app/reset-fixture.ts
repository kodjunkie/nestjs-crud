import { DataSource, QueryRunner } from 'typeorm';
import { Seeds1544303473346 } from './seeds';

/**
 * Truncates every fixture table (derived from the DataSource's own entity
 * metadata, so a future fixture entity needs no edit here) with identity
 * restart, then replays the same seed migration `yarn db:prepare:typeorm:*`
 * runs. Call from a spec file's `beforeAll`, after `app.init()`, so each
 * spec file starts from the seeded state regardless of what an earlier
 * spec file in the same Jest run wrote to the shared database.
 */
export async function resetFixture(dataSource: DataSource): Promise<void> {
  const tableNames = dataSource.entityMetadatas.map((metadata) => metadata.tableName);
  const queryRunner: QueryRunner = dataSource.createQueryRunner();

  try {
    if (dataSource.options.type === 'postgres') {
      const quotedTableNames = tableNames.map((tableName) => `"${tableName}"`).join(', ');
      await queryRunner.query(`TRUNCATE TABLE ${quotedTableNames} RESTART IDENTITY CASCADE`);
    } else {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      for (const tableName of tableNames) {
        await queryRunner.query(`TRUNCATE TABLE \`${tableName}\``);
      }
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    await new Seeds1544303473346().up(queryRunner);
  } finally {
    await queryRunner.release();
  }
}
