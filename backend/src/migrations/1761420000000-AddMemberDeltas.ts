import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/** 회원 증감 수(명) 24시간·7일·30일. 새벽 지표 계산이 채운다 */
export class AddMemberDeltas1761420000000 implements MigrationInterface {
  name = 'AddMemberDeltas1761420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['member_delta_24h', 'member_delta_7d', 'member_delta_30d']) {
      if (!(await queryRunner.hasColumn('channels', name))) {
        await queryRunner.addColumn(
          'channels',
          new TableColumn({ name, type: 'integer', isNullable: true }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of ['member_delta_30d', 'member_delta_7d', 'member_delta_24h']) {
      if (await queryRunner.hasColumn('channels', name)) {
        await queryRunner.dropColumn('channels', name);
      }
    }
  }
}
