import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

export class AddIllegalCleared1761350000000 implements MigrationInterface {
  name = 'AddIllegalCleared1761350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const boolFalse = migrationBoolDefault(sqlite, false);
    const dt = migrationDateTimeType(sqlite);

    if (!(await queryRunner.hasColumn('channels', 'illegal_cleared'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'illegal_cleared',
          type: 'boolean',
          isNullable: false,
          default: boolFalse,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channels', 'illegal_cleared_at'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'illegal_cleared_at',
          type: dt,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channels', 'illegal_cleared_at')) {
      await queryRunner.dropColumn('channels', 'illegal_cleared_at');
    }
    if (await queryRunner.hasColumn('channels', 'illegal_cleared')) {
      await queryRunner.dropColumn('channels', 'illegal_cleared');
    }
  }
}
