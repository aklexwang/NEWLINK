import { MigrationInterface, QueryRunner, Table, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

function datetimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamptz';
}

export class AddChannelDiscovery1761019200000 implements MigrationInterface {
  name = 'AddChannelDiscovery1761019200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqlite(queryRunner);
    const dt = datetimeType(sqlite);

    if (
      !(await queryRunner.hasColumn('channel_posts', 'mentioned_usernames'))
    ) {
      await queryRunner.addColumn(
        'channel_posts',
        new TableColumn({
          name: 'mentioned_usernames',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    if (
      !(await queryRunner.hasColumn(
        'channel_import_candidates',
        'discovery_sources',
      ))
    ) {
      await queryRunner.addColumn(
        'channel_import_candidates',
        new TableColumn({
          name: 'discovery_sources',
          type: 'varchar',
          length: '512',
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasTable('discovered_usernames'))) {
      await queryRunner.createTable(
        new Table({
          name: 'discovered_usernames',
          columns: [
            {
              name: 'username',
              type: 'varchar',
              length: '64',
              isPrimary: true,
            },
            { name: 'result', type: 'varchar', length: '20' },
            { name: 'checked_at', type: dt },
            { name: 'mention_count', type: 'integer', default: 0 },
          ],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('discovered_usernames')) {
      await queryRunner.dropTable('discovered_usernames');
    }
    if (
      await queryRunner.hasColumn(
        'channel_import_candidates',
        'discovery_sources',
      )
    ) {
      await queryRunner.dropColumn(
        'channel_import_candidates',
        'discovery_sources',
      );
    }
    if (await queryRunner.hasColumn('channel_posts', 'mentioned_usernames')) {
      await queryRunner.dropColumn('channel_posts', 'mentioned_usernames');
    }
  }
}
