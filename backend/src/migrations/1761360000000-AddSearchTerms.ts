import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableIndex,
} from 'typeorm';
import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

/**
 * 검색 금지어·예외어 (어드민 설정).
 * id 는 DEFAULT 없이 앱에서 randomUUID() 로 넣는다.
 */
export class AddSearchTerms1761360000000 implements MigrationInterface {
  name = 'AddSearchTerms1761360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('search_terms')) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);

    await queryRunner.createTable(
      new Table({
        name: 'search_terms',
        columns: [
          {
            name: 'id',
            type: sqlite ? 'varchar' : 'uuid',
            length: sqlite ? '36' : undefined,
            isPrimary: true,
          },
          { name: 'kind', type: 'varchar', length: '10', isNullable: false },
          { name: 'term', type: 'varchar', length: '64', isNullable: false },
          {
            name: 'term_normalized',
            type: 'varchar',
            length: '64',
            isNullable: false,
          },
          {
            name: 'enabled',
            type: 'boolean',
            isNullable: false,
            default: migrationBoolDefault(sqlite, true),
          },
          { name: 'created_at', type: dt, isNullable: false },
          { name: 'updated_at', type: dt, isNullable: false },
        ],
      }),
    );
    await queryRunner.createIndex(
      'search_terms',
      new TableIndex({
        name: 'uq_search_terms_kind_norm',
        columnNames: ['kind', 'term_normalized'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('search_terms')) {
      await queryRunner.dropTable('search_terms');
    }
  }
}
