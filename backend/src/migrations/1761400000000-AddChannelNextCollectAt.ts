import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

export const NEXT_COLLECT_AT_INDEX = 'IDX_channels_next_collect_at';

/**
 * 우선순위 수집 큐.
 * - next_collect_at: 다음 수집 예정 시각. NULL 이면 바로 대상. 인덱스 1개.
 * - collect_gone_count: not_found 연속 횟수(gone 3회 규칙). collect_fail_count 는 이제 모든 실패를
 *   세어 재시도 간격(1·2·4배)에 쓰므로, gone 판단용 횟수를 따로 둔다.
 */
export class AddChannelNextCollectAt1761400000000 implements MigrationInterface {
  name = 'AddChannelNextCollectAt1761400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);

    if (!(await queryRunner.hasColumn('channels', 'next_collect_at'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'next_collect_at',
          type: migrationDateTimeType(sqlite),
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn('channels', 'collect_gone_count'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'collect_gone_count',
          type: 'integer',
          isNullable: false,
          default: '0',
        }),
      );
      // 지금까지 collect_fail_count 는 not_found 연속 횟수만 셌다. 그 값을 그대로 옮긴다.
      if (await queryRunner.hasColumn('channels', 'collect_fail_count')) {
        await queryRunner.query(
          'UPDATE channels SET collect_gone_count = COALESCE(collect_fail_count, 0)',
        );
      }
    }

    const table = await queryRunner.getTable('channels');
    const hasIndex = table?.indices.some(
      (index) => index.name === NEXT_COLLECT_AT_INDEX,
    );
    if (!hasIndex) {
      await queryRunner.createIndex(
        'channels',
        new TableIndex({
          name: NEXT_COLLECT_AT_INDEX,
          columnNames: ['next_collect_at'],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    const table = await queryRunner.getTable('channels');
    if (table?.indices.some((index) => index.name === NEXT_COLLECT_AT_INDEX)) {
      await queryRunner.dropIndex('channels', NEXT_COLLECT_AT_INDEX);
    }
    if (await queryRunner.hasColumn('channels', 'collect_gone_count')) {
      await queryRunner.dropColumn('channels', 'collect_gone_count');
    }
    if (await queryRunner.hasColumn('channels', 'next_collect_at')) {
      await queryRunner.dropColumn('channels', 'next_collect_at');
    }
  }
}
