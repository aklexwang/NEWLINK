import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

export class AddStatsRunMode1761280000000 implements MigrationInterface {
  name = 'AddStatsRunMode1761280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('stats_runs'))) return;
    if (await queryRunner.hasColumn('stats_runs', 'mode')) return;
    const sqlite = isSqlite(queryRunner);
    await queryRunner.addColumn(
      'stats_runs',
      new TableColumn({
        name: 'mode',
        type: 'varchar',
        length: '16',
        isNullable: false,
        default: "'full'",
      }),
    );
    if (!sqlite) {
      await queryRunner.query(
        `UPDATE stats_runs SET mode = 'full' WHERE mode IS NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('stats_runs', 'mode')) {
      await queryRunner.dropColumn('stats_runs', 'mode');
    }
  }
}
