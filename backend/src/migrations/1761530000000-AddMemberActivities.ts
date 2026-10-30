import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

/** 로그인 회원 활동 기록(검색·이동·상세·즐겨찾기·카테고리) — 어드민 회원 성향 보기용, 90일 보관 */
export class AddMemberActivities1761530000000 implements MigrationInterface {
  name = 'AddMemberActivities1761530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('member_activities')) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    await queryRunner.createTable(
      new Table({
        name: 'member_activities',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'telegram_id', type: 'bigint', isNullable: false },
          { name: 'kind', type: 'varchar', length: '12', isNullable: false },
          {
            name: 'channel_id',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          { name: 'keyword', type: 'varchar', length: '100', isNullable: true },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          { name: 'created_at', type: dt, isNullable: false },
        ],
      }),
    );
    await queryRunner.createIndex(
      'member_activities',
      new TableIndex({
        name: 'idx_member_activities_user_time',
        columnNames: ['telegram_id', 'created_at'],
      }),
    );
    await queryRunner.createIndex(
      'member_activities',
      new TableIndex({
        name: 'idx_member_activities_time',
        columnNames: ['created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('member_activities')) {
      await queryRunner.dropTable('member_activities');
    }
  }
}
