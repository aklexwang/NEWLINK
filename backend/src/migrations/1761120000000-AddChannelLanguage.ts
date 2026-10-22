import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

export class AddChannelLanguage1761120000000 implements MigrationInterface {
  name = 'AddChannelLanguage1761120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqlite(queryRunner);
    if (!(await queryRunner.hasColumn('channels', 'language'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'language',
          type: 'varchar',
          length: '10',
          isNullable: false,
          default: "'unknown'",
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channels', 'language_locked'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'language_locked',
          type: sqlite ? 'boolean' : 'boolean',
          isNullable: false,
          default: sqlite ? '0' : 'false',
        }),
      );
    }
    if (!(await queryRunner.hasColumn('channel_posts', 'text_excerpt'))) {
      await queryRunner.addColumn(
        'channel_posts',
        new TableColumn({
          name: 'text_excerpt',
          type: 'varchar',
          length: '200',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channel_posts', 'text_excerpt')) {
      await queryRunner.dropColumn('channel_posts', 'text_excerpt');
    }
    if (await queryRunner.hasColumn('channels', 'language_locked')) {
      await queryRunner.dropColumn('channels', 'language_locked');
    }
    if (await queryRunner.hasColumn('channels', 'language')) {
      await queryRunner.dropColumn('channels', 'language');
    }
  }
}
