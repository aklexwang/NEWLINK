import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * 입장 요청을 보낸 수집 계정 라벨(@username 또는 '계정 N').
 * 계정이 많아질 때 어느 계정으로 신청했는지 구분하기 위함.
 */
export class AddChannelJoinRequestAccount1761700000000
  implements MigrationInterface
{
  name = 'AddChannelJoinRequestAccount1761700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (!(await queryRunner.hasColumn('channels', 'join_request_account'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'join_request_account',
          type: 'varchar',
          length: '80',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('channels'))) return;
    if (await queryRunner.hasColumn('channels', 'join_request_account')) {
      await queryRunner.dropColumn('channels', 'join_request_account');
    }
  }
}
