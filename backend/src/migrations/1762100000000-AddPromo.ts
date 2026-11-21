import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/** 홍보 자동화: 홍보할 방 · 홍보 글 · 보낸 기록 */
export class AddPromo1762100000000 implements MigrationInterface {
  name = 'AddPromo1762100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    const now = sqlite ? "(datetime('now'))" : 'now()';
    const bool = (v: boolean) => migrationBoolDefault(sqlite, v);

    if (!(await queryRunner.hasTable('promo_targets'))) {
      await queryRunner.createTable(
        new Table({
          name: 'promo_targets',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'peer_type', type: 'varchar', length: '10' },
            { name: 'peer_id', type: 'varchar', length: '30' },
            {
              name: 'access_hash',
              type: 'varchar',
              length: '40',
              isNullable: true,
            },
            { name: 'title', type: 'varchar', length: '200' },
            {
              name: 'username',
              type: 'varchar',
              length: '64',
              isNullable: true,
            },
            { name: 'member_count', type: 'integer', isNullable: true },
            {
              name: 'about',
              type: 'varchar',
              length: '1000',
              isNullable: true,
            },
            {
              name: 'rule_text',
              type: 'varchar',
              length: '200',
              isNullable: true,
            },
            { name: 'rule_forbidden', type: 'boolean', default: bool(false) },
            { name: 'enabled', type: 'boolean', default: bool(false) },
            { name: 'daily_limit', type: 'integer', default: '1' },
            { name: 'min_gap_minutes', type: 'integer', default: '720' },
            { name: 'text_only', type: 'boolean', default: bool(false) },
            { name: 'status', type: 'varchar', length: '20', default: "'ok'" },
            {
              name: 'last_error',
              type: 'varchar',
              length: '120',
              isNullable: true,
            },
            { name: 'last_posted_at', type: dt, isNullable: true },
            { name: 'next_allowed_at', type: dt, isNullable: true },
            {
              name: 'last_creative_id',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            { name: 'created_at', type: dt, default: now },
          ],
        }),
      );
      await queryRunner.createIndex(
        'promo_targets',
        new TableIndex({
          name: 'uq_promo_targets_peer',
          columnNames: ['peer_type', 'peer_id'],
          isUnique: true,
        }),
      );
    }

    if (!(await queryRunner.hasTable('promo_creatives'))) {
      await queryRunner.createTable(
        new Table({
          name: 'promo_creatives',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'text', type: 'varchar', length: '1000' },
            {
              name: 'image_url',
              type: 'varchar',
              length: '200',
              isNullable: true,
            },
            { name: 'enabled', type: 'boolean', default: bool(true) },
            {
              name: 'source',
              type: 'varchar',
              length: '12',
              default: "'manual'",
            },
            { name: 'sent_count', type: 'integer', default: '0' },
            { name: 'last_sent_at', type: dt, isNullable: true },
            { name: 'created_at', type: dt, default: now },
          ],
        }),
      );
    }

    if (!(await queryRunner.hasTable('promo_post_logs'))) {
      await queryRunner.createTable(
        new Table({
          name: 'promo_post_logs',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'target_id', type: 'varchar', length: '36' },
            { name: 'target_title', type: 'varchar', length: '200' },
            {
              name: 'creative_id',
              type: 'varchar',
              length: '36',
              isNullable: true,
            },
            { name: 'posted_at', type: dt },
            { name: 'ok', type: 'boolean', default: bool(false) },
            { name: 'error', type: 'varchar', length: '120', isNullable: true },
            { name: 'kind', type: 'varchar', length: '10', default: "'auto'" },
          ],
        }),
      );
      await queryRunner.createIndex(
        'promo_post_logs',
        new TableIndex({
          name: 'idx_promo_post_logs_posted',
          columnNames: ['posted_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['promo_post_logs', 'promo_creatives', 'promo_targets']) {
      if (await queryRunner.hasTable(t)) await queryRunner.dropTable(t);
    }
  }
}
