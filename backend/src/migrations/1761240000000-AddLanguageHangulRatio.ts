import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLanguageHangulRatio1761240000000
  implements MigrationInterface
{
  name = 'AddLanguageHangulRatio1761240000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('channels', 'language_hangul_ratio'))) {
      await queryRunner.addColumn(
        'channels',
        new TableColumn({
          name: 'language_hangul_ratio',
          type: 'real',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('channels', 'language_hangul_ratio')) {
      await queryRunner.dropColumn('channels', 'language_hangul_ratio');
    }
  }
}
