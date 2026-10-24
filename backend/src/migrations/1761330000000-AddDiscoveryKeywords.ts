import {
  MigrationInterface,
  QueryRunner,
  Table,
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
 * 발견 키워드 관리.
 * id 컬럼 DEFAULT(gen_random_uuid) 없음 — insert 때 앱에서 randomUUID().
 * 시드는 마이그레이션에 넣지 않음. 부팅 시 테이블이 비어 있을 때만
 * discovery-keywords.ts 상수(flattenDiscoveryKeywords)로 채움.
 */
export class AddDiscoveryKeywords1761330000000 implements MigrationInterface {
  name = 'AddDiscoveryKeywords1761330000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('discovery_keywords')) return;
    const sqlite = isSqlite(queryRunner);
    const uuid = uuidType(sqlite);
    const dt = datetimeType(sqlite);
    const uuidLen = sqlite ? '36' : undefined;
    const boolTrue = sqlite ? '1' : 'true';

    await queryRunner.createTable(
      new Table({
        name: 'discovery_keywords',
        columns: [
          {
            name: 'id',
            type: uuid,
            length: uuidLen,
            isPrimary: true,
          },
          {
            name: 'word',
            type: 'varchar',
            length: '64',
            isNullable: false,
            isUnique: true,
          },
          {
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'enabled',
            type: 'boolean',
            isNullable: false,
            default: boolTrue,
          },
          {
            name: 'sort',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
          {
            name: 'created_at',
            type: dt,
            isNullable: false,
          },
          {
            name: 'last_searched_at',
            type: dt,
            isNullable: true,
          },
          {
            name: 'last_found_count',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'total_new_count',
            type: 'integer',
            isNullable: false,
            default: 0,
          },
        ],
      }),
    );
    await queryRunner.createIndex(
      'discovery_keywords',
      new TableIndex({
        name: 'idx_discovery_keywords_enabled_sort',
        columnNames: ['enabled', 'sort'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('discovery_keywords')) {
      await queryRunner.dropTable('discovery_keywords');
    }
  }
}
