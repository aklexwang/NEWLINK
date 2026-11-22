import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** 배너 광고 자리: home | category:all | category:<카테고리 이름> */
export class AddBannerPlacement1762200000000 implements MigrationInterface {
  name = 'AddBannerPlacement1762200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ad_banners'))) return;
    if (!(await queryRunner.hasColumn('ad_banners', 'placement'))) {
      await queryRunner.addColumn(
        'ad_banners',
        new TableColumn({
          name: 'placement',
          type: 'varchar',
          length: '60',
          default: "'home'",
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('ad_banners'))) return;
    if (await queryRunner.hasColumn('ad_banners', 'placement')) {
      await queryRunner.dropColumn('ad_banners', 'placement');
    }
  }
}
