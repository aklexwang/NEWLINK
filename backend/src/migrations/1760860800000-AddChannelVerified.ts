import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

function datetimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamptz';
}

function boolType(sqlite: boolean): string {
  return sqlite ? 'integer' : 'boolean';
}

export class AddChannelVerified1760860800000 implements MigrationInterface {
  name = 'AddChannelVerified1760860800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqlite(queryRunner);
    const dt = datetimeType(sqlite);
    const bool = boolType(sqlite);

    const columns: TableColumn[] = [
      new TableColumn({
        name: 'is_verified',
        type: bool,
        default: sqlite ? '0' : 'false',
        isNullable: false,
      }),
      new TableColumn({
        name: 'verified_at',
        type: dt,
        isNullable: true,
      }),
      new TableColumn({
        name: 'verified_owner_telegram_id',
        type: sqlite ? 'integer' : 'bigint',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      if (!(await queryRunner.hasColumn('channels', column.name))) {
        await queryRunner.addColumn('channels', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of [
      'verified_owner_telegram_id',
      'verified_at',
      'is_verified',
    ]) {
      if (await queryRunner.hasColumn('channels', name)) {
        await queryRunner.dropColumn('channels', name);
      }
    }
  }
}
