import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

/** 홍보 계정 자동 가입 기록 */
export class AddPromoJoinAttempts1762500000000 implements MigrationInterface {
  name = 'AddPromoJoinAttempts1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('promo_join_attempts')) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    await queryRunner.createTable(
      new Table({
        name: 'promo_join_attempts',
        columns: [
          {
            name: 'channel_id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
          },
          { name: 'username', type: 'varchar', length: '64' },
          { name: 'title', type: 'varchar', length: '200' },
          { name: 'status', type: 'varchar', length: '20' },
          { name: 'error', type: 'varchar', length: '120', isNullable: true },
          { name: 'attempted_at', type: dt },
        ],
      }),
    );
    await queryRunner.createIndex(
      'promo_join_attempts',
      new TableIndex({
        name: 'idx_promo_join_attempts_at',
        columnNames: ['attempted_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('promo_join_attempts'))
      await queryRunner.dropTable('promo_join_attempts');
  }
}
