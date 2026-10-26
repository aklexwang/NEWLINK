import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

export class AddMtprotoCollectColumns1761220000000 implements MigrationInterface {
  name = 'AddMtprotoCollectColumns1761220000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const dateType = isSqlite(queryRunner) ? 'datetime' : 'timestamp';

    if (!(await queryRunner.hasColumn('channels', 'created_on'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'created_on',
          type: dateType,
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channel_posts', 'deleted_at'))) {
      await queryRunner.addColumn(
        'channel_posts',
        new TableColumn({
          name: 'deleted_at',
          type: dateType,
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channel_posts', 'deleted_at')) {
      await queryRunner.dropColumn('channel_posts', 'deleted_at');
    }
    if (await queryRunner.hasColumn('channels', 'created_on')) {
      await queryRunner.dropColumn('channels', 'created_on');
    }
  }
}
