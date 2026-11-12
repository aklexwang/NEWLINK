import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * telegram_access_hash 를 받은 수집 계정 index.
 * access_hash 는 계정마다 달라서, 재사용할 때 그 계정으로만 써야 한다.
 */
export class AddChannelTelegramAccessAccount1761800000000
  implements MigrationInterface
{
  name = 'AddChannelTelegramAccessAccount1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (!(await queryRunner.hasColumn('channels', 'telegram_access_account'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'telegram_access_account',
          type: 'integer',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (await queryRunner.hasColumn('channels', 'telegram_access_account')) {
      await queryRunner.dropColumn('channels', 'telegram_access_account');
    }
  }
}
