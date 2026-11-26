import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/** 회원 공지 */
export class AddNotices1762400000000 implements MigrationInterface {
  name = 'AddNotices1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('notices')) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    const now = sqlite ? "(datetime('now'))" : 'now()';
    const bool = (v: boolean) => migrationBoolDefault(sqlite, v);
    await queryRunner.createTable(
      new Table({
        name: 'notices',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'title', type: 'varchar', length: '120' },
          { name: 'body', type: 'varchar', length: '4000', default: "''" },
          { name: 'pinned', type: 'boolean', default: bool(false) },
          { name: 'published', type: 'boolean', default: bool(true) },
          { name: 'created_at', type: dt, default: now },
          { name: 'updated_at', type: dt, default: now },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('notices'))
      await queryRunner.dropTable('notices');
  }
}
