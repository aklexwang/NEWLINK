import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

function uuidType(sqlite: boolean): string {
  return sqlite ? 'varchar' : 'uuid';
}

function datetimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamp';
}

export class AddStatsRuns1761260000000 implements MigrationInterface {
  name = 'AddStatsRuns1761260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('stats_runs')) return;
    const sqlite = isSqlite(queryRunner);
    const uuid = uuidType(sqlite);
    const dt = datetimeType(sqlite);
    await queryRunner.createTable(
      new Table({
        name: 'stats_runs',
        columns: [
          {
            name: 'id',
            type: uuid,
            length: sqlite ? '36' : undefined,
            isPrimary: true,
          },
          { name: 'started_at', type: dt, isNullable: false },
          { name: 'finished_at', type: dt, isNullable: true },
          { name: 'processed', type: 'integer', default: 0, isNullable: false },
          { name: 'total', type: 'integer', default: 0, isNullable: false },
          {
            name: 'ended_reason',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'stats_runs',
      new TableIndex({
        name: 'idx_stats_runs_finished_at',
        columnNames: ['finished_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('stats_runs')) {
      await queryRunner.dropTable('stats_runs');
    }
  }
}
