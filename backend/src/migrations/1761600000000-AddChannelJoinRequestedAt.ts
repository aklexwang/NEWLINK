import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { isSqliteDriver, migrationDateTimeType } from './migration-column.logic';

/**
 * 승인 필요 비공개 방에 입장 요청(ImportChatInvite)을 보낸 시각.
 * 승인되면 멤버가 되어 접근 정보(access hash)가 생긴다 → 상태(대기/승인/미승인) 파생.
 */
export class AddChannelJoinRequestedAt1761600000000
  implements MigrationInterface
{
  name = 'AddChannelJoinRequestedAt1761600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    if (!(await queryRunner.hasColumn('channels', 'join_requested_at'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'join_requested_at',
          type: migrationDateTimeType(sqlite),
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (await queryRunner.hasColumn('channels', 'join_requested_at')) {
      await queryRunner.dropColumn('channels', 'join_requested_at');
    }
  }
}
