import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** 비공개 초대 링크가 "입장 요청(운영자 승인) 필요"인지. null = 확인 전 */
export class AddChannelInviteRequestNeeded1762000000000
  implements MigrationInterface
{
  name = 'AddChannelInviteRequestNeeded1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (!(await queryRunner.hasColumn('channels', 'invite_request_needed'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'invite_request_needed',
          type: 'boolean',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (await queryRunner.hasColumn('channels', 'invite_request_needed')) {
      await queryRunner.dropColumn('channels', 'invite_request_needed');
    }
  }
}
