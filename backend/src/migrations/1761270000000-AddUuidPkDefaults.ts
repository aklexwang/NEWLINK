import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  MIGRATION_UUID_PK_TABLES,
  postgresUuidIdDefaultSql,
  postgresUuidIdDropDefaultSql,
  postgresUuidIdHasGeneratedDefault,
} from '../stats/uuid-pk-default.logic';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

export class AddUuidPkDefaults1761270000000 implements MigrationInterface {
  name = 'AddUuidPkDefaults1761270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    for (const table of MIGRATION_UUID_PK_TABLES) {
      if (!(await queryRunner.hasTable(table))) continue;
      const rows = (await queryRunner.query(
        `SELECT column_default
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = $1
           AND column_name = 'id'`,
        [table],
      )) as Array<{ column_default: string | null }>;
      if (postgresUuidIdHasGeneratedDefault(rows[0]?.column_default)) {
        continue;
      }
      await queryRunner.query(postgresUuidIdDefaultSql(table));
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (isSqlite(queryRunner)) return;
    for (const table of MIGRATION_UUID_PK_TABLES) {
      if (!(await queryRunner.hasTable(table))) continue;
      await queryRunner.query(postgresUuidIdDropDefaultSql(table));
    }
  }
}
