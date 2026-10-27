import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

/** 광고에 광고회원 연결 + 광고 성과(날짜별 노출·클릭) */
export class AddAdAdvertiserAndStats1761500000000 implements MigrationInterface {
  name = 'AddAdAdvertiserAndStats1761500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['ad_banners', 'rank_ads']) {
      if (!(await queryRunner.hasTable(table))) continue;
      if (!(await queryRunner.hasColumn(table, 'advertiser_telegram_id'))) {
        await queryRunner.addColumn(
          table,
          new TableColumn({
            name: 'advertiser_telegram_id',
            type: 'bigint',
            isNullable: true,
          }),
        );
      }
    }
    if (!(await queryRunner.hasTable('ad_daily_stats'))) {
      await queryRunner.createTable(
        new Table({
          name: 'ad_daily_stats',
          columns: [
            { name: 'ad_kind', type: 'varchar', length: '10', isPrimary: true },
            { name: 'ad_id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'day', type: 'varchar', length: '10', isPrimary: true },
            {
              name: 'impressions',
              type: 'integer',
              default: 0,
              isNullable: false,
            },
            { name: 'clicks', type: 'integer', default: 0, isNullable: false },
          ],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('ad_daily_stats'))
      await queryRunner.dropTable('ad_daily_stats');
    for (const table of ['ad_banners', 'rank_ads']) {
      if (
        (await queryRunner.hasTable(table)) &&
        (await queryRunner.hasColumn(table, 'advertiser_telegram_id'))
      )
        await queryRunner.dropColumn(table, 'advertiser_telegram_id');
    }
  }
}
