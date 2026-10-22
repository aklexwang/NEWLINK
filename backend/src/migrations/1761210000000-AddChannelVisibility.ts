import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

export class AddChannelVisibility1761210000000 implements MigrationInterface {
  name = 'AddChannelVisibility1761210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqlite(queryRunner);
    const boolDefault = sqlite ? '1' : 'true';
    const boolFalse = sqlite ? '0' : 'false';

    if (!(await queryRunner.hasColumn('channels', 'is_visible'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'is_visible',
          type: 'boolean',
          isNullable: false,
          default: boolDefault,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channels', 'category_locked'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'category_locked',
          type: 'boolean',
          isNullable: false,
          default: boolFalse,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channels', 'category_confidence'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'category_confidence',
          type: 'real',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channels', 'auto_registered'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'auto_registered',
          type: 'boolean',
          isNullable: false,
          default: boolFalse,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channels', 'auto_registered')) {
      await queryRunner.dropColumn('channels', 'auto_registered');
    }
    if (await queryRunner.hasColumn('channels', 'category_confidence')) {
      await queryRunner.dropColumn('channels', 'category_confidence');
    }
    if (await queryRunner.hasColumn('channels', 'category_locked')) {
      await queryRunner.dropColumn('channels', 'category_locked');
    }
    if (await queryRunner.hasColumn('channels', 'is_visible')) {
      await queryRunner.dropColumn('channels', 'is_visible');
    }
  }
}
