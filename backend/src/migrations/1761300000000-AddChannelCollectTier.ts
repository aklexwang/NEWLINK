import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddChannelCollectTier1761300000000 implements MigrationInterface {
  name = 'AddChannelCollectTier1761300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (await queryRunner.hasColumn('channels', 'collect_tier')) return;
    await queryRunner.addColumn(
      'channels',
      new TableColumn({
        name: 'collect_tier',
        type: 'varchar',
        length: '16',
        isNullable: false,
        default: "'weekly'",
      }),
    );
    await queryRunner.query(
      `UPDATE channels SET collect_tier = 'daily' WHERE COALESCE(member_count, 0) >= 1000 OR COALESCE(posts_7d, 0) > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channels', 'collect_tier')) {
      await queryRunner.dropColumn('channels', 'collect_tier');
    }
  }
}
