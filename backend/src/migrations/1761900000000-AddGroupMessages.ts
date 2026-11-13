import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/**
 * 그룹 최근 대화(개인정보 가림, 보낸 사람 저장 안 함) + 그룹 최근 대화 참여자 수.
 */
export class AddGroupMessages1761900000000 implements MigrationInterface {
  name = 'AddGroupMessages1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    if (!(await queryRunner.hasTable('group_messages'))) {
      await queryRunner.createTable(
        new Table({
          name: 'group_messages',
          columns: [
            {
              name: 'channel_id',
              type: sqlite ? 'varchar' : 'uuid',
              length: sqlite ? '36' : undefined,
              isPrimary: true,
            },
            { name: 'message_id', type: 'integer', isPrimary: true },
            { name: 'posted_at', type: dt },
            { name: 'text', type: 'varchar', length: '1000', isNullable: true },
            {
              name: 'media_type',
              type: 'varchar',
              length: '20',
              default: "'text'",
            },
            {
              name: 'is_admin_post',
              type: 'boolean',
              default: migrationBoolDefault(sqlite, false),
            },
            {
              name: 'is_pinned',
              type: 'boolean',
              default: migrationBoolDefault(sqlite, false),
            },
            { name: 'collected_at', type: dt },
          ],
        }),
      );
      await queryRunner.createIndex(
        'group_messages',
        new TableIndex({
          name: 'idx_group_messages_channel',
          columnNames: ['channel_id'],
        }),
      );
    }
    if (
      (await queryRunner.hasTable('channels')) &&
      !(await queryRunner.hasColumn('channels', 'group_active_senders'))
    ) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'group_active_senders',
          type: 'integer',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('group_messages')) {
      await queryRunner.dropTable('group_messages');
    }
    if (
      (await queryRunner.hasTable('channels')) &&
      (await queryRunner.hasColumn('channels', 'group_active_senders'))
    ) {
      await queryRunner.dropColumn('channels', 'group_active_senders');
    }
  }
}
