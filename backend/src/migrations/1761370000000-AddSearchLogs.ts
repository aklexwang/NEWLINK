import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/**
 * 회원 검색 기록(익명).
 * - search_logs: 원본. 회원 ID·IP 는 저장하지 않는다. 일정 기간 뒤 자동 삭제.
 * - search_daily_stats: 일별 검색어별 집계. 원본보다 오래 유지.
 */
export class AddSearchLogs1761370000000 implements MigrationInterface {
  name = 'AddSearchLogs1761370000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);

    if (!(await queryRunner.hasTable('search_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'search_logs',
          columns: [
            {
              name: 'id',
              type: sqlite ? 'varchar' : 'uuid',
              length: sqlite ? '36' : undefined,
              isPrimary: true,
            },
            {
              name: 'query_normalized',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'query_raw',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            {
              name: 'result_count',
              type: 'integer',
              isNullable: false,
              default: 0,
            },
            {
              name: 'blocked',
              type: 'boolean',
              isNullable: false,
              default: migrationBoolDefault(sqlite, false),
            },
            {
              name: 'searched_on',
              type: 'varchar',
              length: '10',
              isNullable: false,
            },
            { name: 'created_at', type: dt, isNullable: false },
          ],
        }),
      );
      await queryRunner.createIndex(
        'search_logs',
        new TableIndex({
          name: 'idx_search_logs_created_at',
          columnNames: ['created_at'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('search_daily_stats'))) {
      await queryRunner.createTable(
        new Table({
          name: 'search_daily_stats',
          columns: [
            {
              name: 'stat_date',
              type: 'varchar',
              length: '10',
              isPrimary: true,
            },
            {
              name: 'query_normalized',
              type: 'varchar',
              length: '100',
              isPrimary: true,
            },
            {
              name: 'search_count',
              type: 'integer',
              isNullable: false,
              default: 0,
            },
            {
              name: 'zero_count',
              type: 'integer',
              isNullable: false,
              default: 0,
            },
            {
              name: 'blocked_count',
              type: 'integer',
              isNullable: false,
              default: 0,
            },
          ],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('search_daily_stats')) {
      await queryRunner.dropTable('search_daily_stats');
    }
    if (await queryRunner.hasTable('search_logs')) {
      await queryRunner.dropTable('search_logs');
    }
  }
}
