import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/** 텔레그램방 순위 광고(전체 카테고리 / 카테고리별 1~5위 자리) */
export class AddRankAds1761470000000 implements MigrationInterface {
  name = 'AddRankAds1761470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    const now = sqlite ? "(datetime('now'))" : 'now()';
    if (await queryRunner.hasTable('rank_ads')) return;
    await queryRunner.createTable(
      new Table({
        name: 'rank_ads',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          {
            name: 'channel_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          { name: 'scope', type: 'varchar', length: '10', isNullable: false },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          { name: 'slot', type: 'integer', isNullable: false },
          { name: 'starts_at', type: dt, isNullable: true },
          { name: 'ends_at', type: dt, isNullable: true },
          {
            name: 'is_active',
            type: 'boolean',
            default: migrationBoolDefault(sqlite, true),
            isNullable: false,
          },
          { name: 'memo', type: 'varchar', length: '200', isNullable: true },
          { name: 'clicks', type: 'integer', default: 0, isNullable: false },
          { name: 'created_at', type: dt, default: now, isNullable: false },
          { name: 'updated_at', type: dt, default: now, isNullable: false },
        ],
      }),
    );
    await queryRunner.createIndex(
      'rank_ads',
      new TableIndex({
        name: 'IDX_rank_ads_scope_category',
        columnNames: ['scope', 'category'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('rank_ads'))
      await queryRunner.dropTable('rank_ads');
  }
}
