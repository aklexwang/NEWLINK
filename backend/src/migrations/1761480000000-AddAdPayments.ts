import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** 광고비(USDT)·받은 날: 배너 광고, 텔레그램방 광고 둘 다 */
export class AddAdPayments1761480000000 implements MigrationInterface {
  name = 'AddAdPayments1761480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['ad_banners', 'rank_ads']) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (!(await queryRunner.hasColumn(table, 'paid_usdt'))) {
        await queryRunner.addColumn(
          table,
          new TableColumn({
            name: 'paid_usdt',
            type: 'real',
            isNullable: true,
          }),
        );
      }
      if (!(await queryRunner.hasColumn(table, 'paid_on'))) {
        await queryRunner.addColumn(
          table,
          new TableColumn({
            name: 'paid_on',
            type: 'varchar',
            length: '10',
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['ad_banners', 'rank_ads']) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (await queryRunner.hasColumn(table, 'paid_on'))
        await queryRunner.dropColumn(table, 'paid_on');
      if (await queryRunner.hasColumn(table, 'paid_usdt'))
        await queryRunner.dropColumn(table, 'paid_usdt');
    }
  }
}
