import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddSnapshotActivity1761230000000 implements MigrationInterface {
  name = 'AddSnapshotActivity1761230000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('channel_snapshots', 'activity_24h'))) {
      await queryRunner.addColumn(
        'channel_snapshots',
        new TableColumn({
          name: 'activity_24h',
          type: 'integer',
          isNullable: false,
          default: 0,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channel_snapshots', 'activity_7d'))) {
      await queryRunner.addColumn(
        'channel_snapshots',
        new TableColumn({
          name: 'activity_7d',
          type: 'integer',
          isNullable: false,
          default: 0,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channel_snapshots', 'activity_7d')) {
      await queryRunner.dropColumn('channel_snapshots', 'activity_7d');
    }
    if (await queryRunner.hasColumn('channel_snapshots', 'activity_24h')) {
      await queryRunner.dropColumn('channel_snapshots', 'activity_24h');
    }
  }
}
