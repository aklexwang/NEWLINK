import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

export class AddCollectClassifyCache1761040800000 implements MigrationInterface {
  name = 'AddCollectClassifyCache1761040800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('channels', 'classified_kind'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'classified_kind',
          type: 'varchar',
          length: '20',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channels', 'classified_at'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'classified_at',
          type: isSqlite(queryRunner) ? 'datetime' : 'timestamp',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channels', 'classified_at')) {
      await queryRunner.dropColumn('channels', 'classified_at');
    }
    if (await queryRunner.hasColumn('channels', 'classified_kind')) {
      await queryRunner.dropColumn('channels', 'classified_kind');
    }
  }
}
