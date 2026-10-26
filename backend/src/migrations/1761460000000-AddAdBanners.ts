import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/** 홈 배너 광고(이미지 DB 저장) + 작은 설정 표(배너 넘김 간격 등) */
export class AddAdBanners1761460000000 implements MigrationInterface {
  name = 'AddAdBanners1761460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    const now = sqlite ? "(datetime('now'))" : 'now()';
    if (!(await queryRunner.hasTable('ad_banners'))) {
      await queryRunner.createTable(
        new Table({
          name: 'ad_banners',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            {
              name: 'title',
              type: 'varchar',
              length: '100',
              isNullable: false,
            },
            { name: 'link', type: 'varchar', length: '512', isNullable: false },
            {
              name: 'image_mime',
              type: 'varchar',
              length: '40',
              isNullable: false,
            },
            {
              name: 'image_data',
              type: sqlite ? 'blob' : 'bytea',
              isNullable: false,
            },
            {
              name: 'image_version',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            { name: 'starts_at', type: dt, isNullable: true },
            { name: 'ends_at', type: dt, isNullable: true },
            {
              name: 'sort_order',
              type: 'integer',
              default: 0,
              isNullable: false,
            },
            {
              name: 'is_active',
              type: 'boolean',
              default: migrationBoolDefault(sqlite, true),
              isNullable: false,
            },
            { name: 'clicks', type: 'integer', default: 0, isNullable: false },
            { name: 'created_at', type: dt, default: now, isNullable: false },
            { name: 'updated_at', type: dt, default: now, isNullable: false },
          ],
        }),
      );
    }
    if (!(await queryRunner.hasTable('app_settings'))) {
      await queryRunner.createTable(
        new Table({
          name: 'app_settings',
          columns: [
            { name: 'key', type: 'varchar', length: '64', isPrimary: true },
            {
              name: 'value',
              type: 'varchar',
              length: '500',
              isNullable: false,
            },
            { name: 'updated_at', type: dt, default: now, isNullable: false },
          ],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('app_settings'))
      await queryRunner.dropTable('app_settings');
    if (await queryRunner.hasTable('ad_banners'))
      await queryRunner.dropTable('ad_banners');
  }
}
