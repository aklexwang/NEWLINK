import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

/** 미니앱 방문자(비회원 포함): 텔레그램 ID·이름·@아이디·방문 날짜 수. 전화번호 없음, 90일 보관 */
export class AddVisitors1761540000000 implements MigrationInterface {
  name = 'AddVisitors1761540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('visitors')) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    await queryRunner.createTable(
      new Table({
        name: 'visitors',
        columns: [
          { name: 'telegram_id', type: 'bigint', isPrimary: true },
          {
            name: 'first_name',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'username',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'language_code',
            type: 'varchar',
            length: '10',
            isNullable: true,
          },
          {
            name: 'is_premium',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          { name: 'first_seen_at', type: dt, isNullable: false },
          { name: 'last_seen_at', type: dt, isNullable: false },
          {
            name: 'visit_days',
            type: 'integer',
            default: 1,
            isNullable: false,
          },
          {
            name: 'last_day',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'visitors',
      new TableIndex({
        name: 'idx_visitors_last_seen',
        columnNames: ['last_seen_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('visitors'))
      await queryRunner.dropTable('visitors');
  }
}
