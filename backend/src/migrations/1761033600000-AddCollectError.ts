import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCollectError1761033600000 implements MigrationInterface {
  name = 'AddCollectError1761033600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('channels', 'collect_error'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'collect_error',
          type: 'varchar',
          length: '255',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channels', 'collect_error')) {
      await queryRunner.dropColumn('channels', 'collect_error');
    }
  }
}
