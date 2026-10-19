import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
} from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

function uuidType(sqlite: boolean): string {
  return sqlite ? 'varchar' : 'uuid';
}

function datetimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamptz';
}

function boolType(sqlite: boolean): string {
  return sqlite ? 'integer' : 'boolean';
}

function boolDefault(sqlite: boolean, value: boolean): string {
  if (sqlite) return value ? '1' : '0';
  return value ? 'true' : 'false';
}

export class AddChannelStats1760852400000 implements MigrationInterface {
  name = 'AddChannelStats1760852400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqlite(queryRunner);
    const uuid = uuidType(sqlite);
    const dt = datetimeType(sqlite);
    const bool = boolType(sqlite);

    await this.addChannelColumns(queryRunner, sqlite, dt);

    if (!(await queryRunner.hasTable('channel_snapshots'))) {
      await queryRunner.createTable(
        new Table({
          name: 'channel_snapshots',
          columns: [
            {
              name: 'id',
              type: uuid,
              length: sqlite ? '36' : undefined,
              isPrimary: true,
            },
            {
              name: 'channel_id',
              type: uuid,
              length: sqlite ? '36' : undefined,
            },
            { name: 'captured_on', type: 'varchar', length: '10' },
            { name: 'member_count', type: 'integer', default: 0 },
            { name: 'median_views_7d', type: 'integer', default: 0 },
            { name: 'posts_7d', type: 'integer', default: 0 },
            { name: 'forwarded_ratio', type: 'real', default: 0 },
          ],
        }),
      );
      await queryRunner.createIndex(
        'channel_snapshots',
        new TableIndex({
          name: 'uq_channel_snapshots_channel_captured',
          columnNames: ['channel_id', 'captured_on'],
          isUnique: true,
        }),
      );
      await queryRunner.createIndex(
        'channel_snapshots',
        new TableIndex({
          name: 'idx_channel_snapshots_channel',
          columnNames: ['channel_id'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('channel_posts'))) {
      await queryRunner.createTable(
        new Table({
          name: 'channel_posts',
          columns: [
            {
              name: 'id',
              type: uuid,
              length: sqlite ? '36' : undefined,
              isPrimary: true,
            },
            {
              name: 'channel_id',
              type: uuid,
              length: sqlite ? '36' : undefined,
            },
            { name: 'message_id', type: 'integer' },
            { name: 'posted_at', type: dt },
            { name: 'views', type: 'integer', isNullable: true },
            {
              name: 'media_type',
              type: 'varchar',
              length: '20',
              default: "'text'",
            },
            {
              name: 'forwarded_from',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'is_edited',
              type: bool,
              default: boolDefault(sqlite, false),
            },
            { name: 'last_seen_at', type: dt },
          ],
        }),
      );
      await queryRunner.createIndex(
        'channel_posts',
        new TableIndex({
          name: 'uq_channel_posts_channel_message',
          columnNames: ['channel_id', 'message_id'],
          isUnique: true,
        }),
      );
      await queryRunner.createIndex(
        'channel_posts',
        new TableIndex({
          name: 'idx_channel_posts_channel',
          columnNames: ['channel_id'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('channel_scores'))) {
      await queryRunner.createTable(
        new Table({
          name: 'channel_scores',
          columns: [
            {
              name: 'id',
              type: uuid,
              length: sqlite ? '36' : undefined,
              isPrimary: true,
            },
            {
              name: 'channel_id',
              type: uuid,
              length: sqlite ? '36' : undefined,
            },
            { name: 'scored_on', type: 'varchar', length: '10' },
            { name: 'total', type: 'integer', default: 0 },
            { name: 'grade', type: 'varchar', length: '1' },
            { name: 'scale_score', type: 'real', default: 0 },
            { name: 'view_rate_score', type: 'real', default: 0 },
            { name: 'activity_score', type: 'real', default: 0 },
            { name: 'growth_score', type: 'real', default: 0 },
            {
              name: 'manipulation_suspected',
              type: bool,
              default: boolDefault(sqlite, false),
            },
            { name: 'overall_rank', type: 'integer', isNullable: true },
            { name: 'category_rank', type: 'integer', isNullable: true },
          ],
        }),
      );
      await queryRunner.createIndex(
        'channel_scores',
        new TableIndex({
          name: 'uq_channel_scores_channel_scored',
          columnNames: ['channel_id', 'scored_on'],
          isUnique: true,
        }),
      );
      await queryRunner.createIndex(
        'channel_scores',
        new TableIndex({
          name: 'idx_channel_scores_channel',
          columnNames: ['channel_id'],
        }),
      );
    }

    if (!(await queryRunner.hasTable('channel_events'))) {
      await queryRunner.createTable(
        new Table({
          name: 'channel_events',
          columns: [
            {
              name: 'id',
              type: uuid,
              length: sqlite ? '36' : undefined,
              isPrimary: true,
            },
            {
              name: 'channel_id',
              type: uuid,
              length: sqlite ? '36' : undefined,
            },
            { name: 'type', type: 'varchar', length: '32' },
            {
              name: 'before',
              type: 'varchar',
              length: '512',
              isNullable: true,
            },
            { name: 'after', type: 'varchar', length: '512', isNullable: true },
            { name: 'occurred_at', type: dt },
          ],
        }),
      );
      await queryRunner.createIndex(
        'channel_events',
        new TableIndex({
          name: 'idx_channel_events_channel',
          columnNames: ['channel_id'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('channel_events', true);
    await queryRunner.dropTable('channel_scores', true);
    await queryRunner.dropTable('channel_posts', true);
    await queryRunner.dropTable('channel_snapshots', true);

    const dropCols = [
      'username',
      'telegram_chat_id',
      'first_observed_at',
      'last_collected_at',
      'collect_status',
      'collect_fail_count',
      'score',
      'grade',
      'view_rate',
      'growth_24h',
      'growth_7d',
      'growth_30d',
      'median_views_7d',
      'posts_7d',
      'observed_days',
    ];
    for (const name of dropCols) {
      if (await queryRunner.hasColumn('channels', name)) {
        await queryRunner.dropColumn('channels', name);
      }
    }
  }

  private async addChannelColumns(
    queryRunner: QueryRunner,
    sqlite: boolean,
    dt: string,
  ): Promise<void> {
    const columns: TableColumn[] = [
      new TableColumn({
        name: 'username',
        type: 'varchar',
        length: '64',
        isNullable: true,
      }),
      new TableColumn({
        name: 'telegram_chat_id',
        type: sqlite ? 'integer' : 'bigint',
        isNullable: true,
      }),
      new TableColumn({
        name: 'first_observed_at',
        type: dt,
        isNullable: true,
      }),
      new TableColumn({
        name: 'last_collected_at',
        type: dt,
        isNullable: true,
      }),
      new TableColumn({
        name: 'collect_status',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
      new TableColumn({
        name: 'collect_fail_count',
        type: 'integer',
        default: 0,
        isNullable: false,
      }),
      new TableColumn({ name: 'score', type: 'integer', isNullable: true }),
      new TableColumn({
        name: 'grade',
        type: 'varchar',
        length: '1',
        isNullable: true,
      }),
      new TableColumn({ name: 'view_rate', type: 'real', isNullable: true }),
      new TableColumn({ name: 'growth_24h', type: 'real', isNullable: true }),
      new TableColumn({ name: 'growth_7d', type: 'real', isNullable: true }),
      new TableColumn({ name: 'growth_30d', type: 'real', isNullable: true }),
      new TableColumn({
        name: 'median_views_7d',
        type: 'integer',
        isNullable: true,
      }),
      new TableColumn({ name: 'posts_7d', type: 'integer', isNullable: true }),
      new TableColumn({
        name: 'observed_days',
        type: 'integer',
        isNullable: true,
      }),
    ];

    for (const column of columns) {
      if (!(await queryRunner.hasColumn('channels', column.name))) {
        await queryRunner.addColumn('channels', column);
      }
    }
  }
}
