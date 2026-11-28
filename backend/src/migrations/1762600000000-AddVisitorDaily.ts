import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/** 날짜별 미니앱 방문자 수 */
export class AddVisitorDaily1762600000000 implements MigrationInterface {
  name = 'AddVisitorDaily1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('visitor_daily')) return;
    await queryRunner.createTable(
      new Table({
        name: 'visitor_daily',
        columns: [
          { name: 'day', type: 'varchar', length: '10', isPrimary: true },
          { name: 'visitors', type: 'integer', default: 0 },
          { name: 'new_visitors', type: 'integer', default: 0 },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('visitor_daily'))
      await queryRunner.dropTable('visitor_daily');
  }
}
