import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

function datetimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamp';
}

export class AddAccessHashAndMtprotoState1761290000000 implements MigrationInterface {
  name = 'AddAccessHashAndMtprotoState1761290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqlite(queryRunner);
    if (!(await queryRunner.hasColumn('channels', 'telegram_access_hash'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'telegram_access_hash',
          type: 'varchar',
          length: '64',
          isNullable: true,
        }),
      );
    }
    if (await queryRunner.hasTable('mtproto_state')) return;
    const dt = datetimeType(sqlite);
    await queryRunner.createTable(
      new Table({
        name: 'mtproto_state',
        columns: [
          { name: 'id', type: 'integer', isPrimary: true },
          { name: 'flood_wait_started_at', type: dt, isNullable: true },
          { name: 'flood_wait_until', type: dt, isNullable: true },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('mtproto_state')) {
      await queryRunner.dropTable('mtproto_state');
    }
    if (await queryRunner.hasColumn('channels', 'telegram_access_hash')) {
      await queryRunner.dropColumn('channels', 'telegram_access_hash');
    }
  }
}
