import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import {
  isSqliteDriver,
  migrationDateTimeType,
} from './migration-column.logic';

/** 관리자가 올린 이미지(카테고리 아이콘·방 프로필)를 DB 에 저장 — 배포해도 안 깨지게 */
export class AddStoredImages1761510000000 implements MigrationInterface {
  name = 'AddStoredImages1761510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('stored_images')) return;
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    const now = sqlite ? "(datetime('now'))" : 'now()';
    await queryRunner.createTable(
      new Table({
        name: 'stored_images',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'kind', type: 'varchar', length: '20', isNullable: false },
          { name: 'mime', type: 'varchar', length: '40', isNullable: false },
          { name: 'data', type: sqlite ? 'blob' : 'bytea', isNullable: false },
          { name: 'created_at', type: dt, default: now, isNullable: false },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('stored_images')) {
      await queryRunner.dropTable('stored_images');
    }
  }
}
