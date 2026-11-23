import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** 홈 피드에 나올 방(관리자가 직접 고름). 하나라도 고르면 홈 피드는 고른 방만 */
export class AddChannelFeedPicked1762300000000 implements MigrationInterface {
  name = 'AddChannelFeedPicked1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (!(await queryRunner.hasColumn('channels', 'feed_picked'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'feed_picked',
          type: 'boolean',
          isNullable: false,
          default: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (await queryRunner.hasColumn('channels', 'feed_picked')) {
      await queryRunner.dropColumn('channels', 'feed_picked');
    }
  }
}
