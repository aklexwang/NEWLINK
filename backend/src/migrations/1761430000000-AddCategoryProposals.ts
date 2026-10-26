import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

/** 전체 카테고리 재분류 미리보기(전 → 후). 적용 전까지 채널은 그대로 */
export class AddCategoryProposals1761430000000 implements MigrationInterface {
  name = 'AddCategoryProposals1761430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('category_proposals')) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    await queryRunner.createTable(
      new Table({
        name: 'category_proposals',
        columns: [
          {
            name: 'id',
            type: sqlite ? 'varchar' : 'uuid',
            length: sqlite ? '36' : undefined,
            isPrimary: true,
            ...(sqlite ? {} : { default: 'gen_random_uuid()' }),
          },
          {
            name: 'batch_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'channel_id',
            type: 'varchar',
            length: '36',
            isNullable: false,
          },
          {
            name: 'before_category',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'after_category',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          { name: 'confidence', type: 'real', isNullable: true },
          { name: 'source', type: 'varchar', length: '16', isNullable: false },
          { name: 'reason', type: 'varchar', length: '300', isNullable: true },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'created_at',
            type: migrationDateTimeType(sqlite),
            default: sqlite ? "(datetime('now'))" : 'now()',
            isNullable: false,
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'category_proposals',
      new TableIndex({
        name: 'idx_category_proposals_batch',
        columnNames: ['batch_id', 'status'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('category_proposals')) {
      await queryRunner.dropTable('category_proposals');
    }
  }
}
