import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { isSqliteDriver, migrationBoolDefault } from './migration-column.logic';

/** 회원 구분: 일반회원 / 광고회원. 예전 채널 광고의 광고주 회원은 광고회원으로 시작 */
export class AddUserAdvertiser1761490000000 implements MigrationInterface {
  name = 'AddUserAdvertiser1761490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    if (!(await queryRunner.hasTable('users'))) return;
    if (!(await queryRunner.hasColumn('users', 'is_advertiser'))) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'is_advertiser',
          type: 'boolean',
          default: migrationBoolDefault(sqlite, false),
          isNullable: false,
        }),
      );
    }
    if (
      await queryRunner.hasColumn('channels', 'promotion_client_telegram_id')
    ) {
      await queryRunner.query(
        `UPDATE users SET is_advertiser = ${sqlite ? 1 : 'true'}
         WHERE telegram_id IN (
           SELECT promotion_client_telegram_id FROM channels
           WHERE promotion_client_telegram_id IS NOT NULL
         )`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('users', 'is_advertiser'))
      await queryRunner.dropColumn('users', 'is_advertiser');
  }
}
