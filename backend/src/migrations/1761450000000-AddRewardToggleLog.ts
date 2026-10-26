import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/**
 * 보상 활성/비활성 바꾼 시각과 기록.
 * 회원 제보는 "제보한 시각"의 활성 여부로 보상 대상인지 정한다.
 */
export class AddRewardToggleLog1761450000000 implements MigrationInterface {
  name = 'AddRewardToggleLog1761450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    if (
      (await queryRunner.hasTable('reward_settings')) &&
      !(await queryRunner.hasColumn('reward_settings', 'enabled_changed_at'))
    ) {
      await queryRunner.addColumn(
        'reward_settings',
        new TableColumn({
          name: 'enabled_changed_at',
          type: dt,
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasTable('reward_toggle_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'reward_toggle_logs',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            {
              name: 'enabled',
              type: 'boolean',
              default: migrationBoolDefault(sqlite, true),
              isNullable: false,
            },
            {
              name: 'changed_at',
              type: dt,
              default: sqlite ? "(datetime('now'))" : 'now()',
              isNullable: false,
            },
            {
              name: 'changed_by',
              type: 'varchar',
              length: '64',
              isNullable: true,
            },
          ],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('reward_toggle_logs')) {
      await queryRunner.dropTable('reward_toggle_logs');
    }
    if (
      (await queryRunner.hasTable('reward_settings')) &&
      (await queryRunner.hasColumn('reward_settings', 'enabled_changed_at'))
    ) {
      await queryRunner.dropColumn('reward_settings', 'enabled_changed_at');
    }
  }
}
