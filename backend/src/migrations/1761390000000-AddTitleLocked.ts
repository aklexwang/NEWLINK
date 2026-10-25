import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { isSqliteDriver, migrationBoolDefault } from './migration-column.logic';

export class AddTitleLocked1761390000000 implements MigrationInterface {
  name = 'AddTitleLocked1761390000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const boolFalse = migrationBoolDefault(sqlite, false);

    if (!(await queryRunner.hasColumn('channels', 'title_locked'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'title_locked',
          type: 'boolean',
          isNullable: false,
          default: boolFalse,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channels', 'title_locked')) {
      await queryRunner.dropColumn('channels', 'title_locked');
    }
  }
}
