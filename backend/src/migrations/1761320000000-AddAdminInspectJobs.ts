import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

function isSqlite(queryRunner: QueryRunner): boolean {
  const type = queryRunner.connection.options.type;
  return type === 'sqlite' || type === 'better-sqlite3';
}

function uuidType(sqlite: boolean): string {
  return sqlite ? 'varchar' : 'uuid';
}

/** 엔티티 dateTimeColumnType() 과 같음: SQLite datetime / Postgres timestamptz */
function datetimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamptz';
}

/**
 * 어드민 대량 링크 미리보기.
 * id 컬럼 DEFAULT(gen_random_uuid) 없음 — insert 때 앱에서 randomUUID().
 * 7일 지난 job 삭제는 앱(시작 시·새 job 시작 시)에서 처리. 마이그레이션에 스케줄러 없음.
 */
export class AddAdminInspectJobs1761320000000 implements MigrationInterface {
  name = 'AddAdminInspectJobs1761320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('admin_inspect_jobs')) return;
    const sqlite = isSqlite(queryRunner);
    const uuid = uuidType(sqlite);
    const dt = datetimeType(sqlite);
    const uuidLen = sqlite ? '36' : undefined;

    await queryRunner.createTable(
      new Table({
        name: 'admin_inspect_jobs',
        columns: [
          {
            name: 'id',
            type: uuid,
            length: uuidLen,
            isPrimary: true,
          },
          { name: 'status', type: 'varchar', length: '20', isNullable: false },
          { name: 'processed', type: 'integer', default: 0, isNullable: false },
          { name: 'total', type: 'integer', default: 0, isNullable: false },
          {
            name: 'ended_reason',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          { name: 'created_at', type: dt, isNullable: false },
          { name: 'started_at', type: dt, isNullable: true },
          { name: 'finished_at', type: dt, isNullable: true },
        ],
      }),
    );
    await queryRunner.createIndex(
      'admin_inspect_jobs',
      new TableIndex({
        name: 'idx_admin_inspect_jobs_status',
        columnNames: ['status'],
      }),
    );
    await queryRunner.createIndex(
      'admin_inspect_jobs',
      new TableIndex({
        name: 'idx_admin_inspect_jobs_created_at',
        columnNames: ['created_at'],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'admin_inspect_items',
        columns: [
          {
            name: 'id',
            type: uuid,
            length: uuidLen,
            isPrimary: true,
          },
          {
            name: 'job_id',
            type: uuid,
            length: uuidLen,
            isNullable: false,
          },
          { name: 'line_no', type: 'integer', isNullable: false },
          { name: 'raw_input', type: 'varchar', length: '512', isNullable: false },
          { name: 'link', type: 'varchar', length: '512', isNullable: true },
          {
            name: 'username',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'result',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          { name: 'title', type: 'varchar', length: '255', isNullable: true },
          {
            name: 'member_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'link_type',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'language',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'registered_channel_id',
            type: uuid,
            length: uuidLen,
            isNullable: true,
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'admin_inspect_items',
      new TableIndex({
        name: 'idx_admin_inspect_items_job_id',
        columnNames: ['job_id'],
      }),
    );
    await queryRunner.createIndex(
      'admin_inspect_items',
      new TableIndex({
        name: 'uq_admin_inspect_items_job_line',
        columnNames: ['job_id', 'line_no'],
        isUnique: true,
      }),
    );
    await queryRunner.createForeignKey(
      'admin_inspect_items',
      new TableForeignKey({
        name: 'fk_admin_inspect_items_job',
        columnNames: ['job_id'],
        referencedTableName: 'admin_inspect_jobs',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    if (
      (await queryRunner.hasTable('discovered_usernames')) &&
      !(await queryRunner.hasColumn('discovered_usernames', 'source'))
    ) {
      await queryRunner.addColumn(
        'discovered_usernames',
        new TableColumn({
          name: 'source',
          type: 'varchar',
          length: '20',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('admin_inspect_items')) {
      await queryRunner.dropTable('admin_inspect_items');
    }
    if (await queryRunner.hasTable('admin_inspect_jobs')) {
      await queryRunner.dropTable('admin_inspect_jobs');
    }
  }
}
