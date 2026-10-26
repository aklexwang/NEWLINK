import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

/**
 * - channels.suggested_category: 목록에 맞는 게 없을 때 AI 가 제안한 새 카테고리 이름
 * - admin_notifications: 어드민 종 알림 (key 로 같은 알림을 한 번만)
 */
export class AddCategorySuggestionsAndNotifications1761440000000 implements MigrationInterface {
  name = 'AddCategorySuggestionsAndNotifications1761440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    if (!(await queryRunner.hasColumn('channels', 'suggested_category'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'suggested_category',
          type: 'varchar',
          length: '50',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasTable('admin_notifications'))) {
      const dt = migrationDateTimeType(sqlite);
      await queryRunner.createTable(
        new Table({
          name: 'admin_notifications',
          columns: [
            {
              name: 'id',
              type: sqlite ? 'varchar' : 'uuid',
              length: sqlite ? '36' : undefined,
              isPrimary: true,
            },
            {
              name: 'key',
              type: 'varchar',
              length: '120',
              isNullable: false,
              isUnique: true,
            },
            { name: 'type', type: 'varchar', length: '40', isNullable: false },
            {
              name: 'title',
              type: 'varchar',
              length: '200',
              isNullable: false,
            },
            { name: 'body', type: 'varchar', length: '500', isNullable: true },
            { name: 'link', type: 'varchar', length: '200', isNullable: true },
            {
              name: 'created_at',
              type: dt,
              default: sqlite ? "(datetime('now'))" : 'now()',
              isNullable: false,
            },
            { name: 'read_at', type: dt, isNullable: true },
          ],
        }),
      );
      await queryRunner.createIndex(
        'admin_notifications',
        new TableIndex({
          name: 'idx_admin_notifications_created',
          columnNames: ['created_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('admin_notifications')) {
      await queryRunner.dropTable('admin_notifications');
    }
    if (await queryRunner.hasColumn('channels', 'suggested_category')) {
      await queryRunner.dropColumn('channels', 'suggested_category');
    }
  }
}
