import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

/**
 * "텔레그램에서 열기" 이동 기록.
 * - telegram_open_recent: 같은 사람이 같은 채널을 1시간 안에 다시 눌렀는지 보는 임시 표.
 *   visitor_hash 는 하루 단위 솔트로 만든 해시라 IP 를 되돌릴 수 없다. 48시간 뒤 삭제.
 * - channel_open_daily: 채널별 일별 이동 수.
 */
export class AddTelegramOpens1761380000000 implements MigrationInterface {
  name = 'AddTelegramOpens1761380000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    const uuidType = sqlite ? 'varchar' : 'uuid';
    const uuidLength = sqlite ? '36' : undefined;

    if (!(await queryRunner.hasTable('telegram_open_recent'))) {
      await queryRunner.createTable(
        new Table({
          name: 'telegram_open_recent',
          columns: [
            {
              name: 'channel_id',
              type: uuidType,
              length: uuidLength,
              isPrimary: true,
            },
            {
              name: 'visitor_hash',
              type: 'varchar',
              length: '64',
              isPrimary: true,
            },
            { name: 'last_counted_at', type: dt, isNullable: false },
          ],
        }),
      );
      await queryRunner.createIndex(
        'telegram_open_recent',
        new TableIndex({
          name: 'idx_telegram_open_recent_at',
          columnNames: ['last_counted_at'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('channel_open_daily'))) {
      await queryRunner.createTable(
        new Table({
          name: 'channel_open_daily',
          columns: [
            {
              name: 'channel_id',
              type: uuidType,
              length: uuidLength,
              isPrimary: true,
            },
            {
              name: 'open_date',
              type: 'varchar',
              length: '10',
              isPrimary: true,
            },
            {
              name: 'open_count',
              type: 'integer',
              isNullable: false,
              default: 0,
            },
          ],
        }),
      );
      await queryRunner.createIndex(
        'channel_open_daily',
        new TableIndex({
          name: 'idx_channel_open_daily_date',
          columnNames: ['open_date'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('channel_open_daily')) {
      await queryRunner.dropTable('channel_open_daily');
    }
    if (await queryRunner.hasTable('telegram_open_recent')) {
      await queryRunner.dropTable('telegram_open_recent');
    }
  }
}
