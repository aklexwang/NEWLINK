import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { isSqliteDriver, migrationDateTimeType } from './migration-column.logic';

/**
 * 채널 ↔ 연결된 대화방. 채널 행에는 대화방, 그룹 행에는 부모 채널 정보를 담는다.
 * id 는 -100 접두사를 뗀 양수(MTProto 형식).
 */
export class AddLinkedChat1761410000000 implements MigrationInterface {
  name = 'AddLinkedChat1761410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sqlite = isSqliteDriver(queryRunner.connection.options.type);
    const dt = migrationDateTimeType(sqlite);
    const columns: TableColumn[] = [
      new TableColumn({ name: 'linked_chat_telegram_id', type: 'bigint', isNullable: true }),
      new TableColumn({ name: 'linked_chat_title', type: 'varchar', length: '255', isNullable: true }),
      new TableColumn({ name: 'linked_chat_username', type: 'varchar', length: '64', isNullable: true }),
      new TableColumn({ name: 'linked_chat_created_on', type: dt, isNullable: true }),
    ];
    for (const column of columns) {
      if (!(await queryRunner.hasColumn('channels', column.name))) {
        await queryRunner.addColumn('channels', column);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of [
      'linked_chat_created_on',
      'linked_chat_username',
      'linked_chat_title',
      'linked_chat_telegram_id',
    ]) {
      if (await queryRunner.hasColumn('channels', name)) {
        await queryRunner.dropColumn('channels', name);
      }
    }
  }
}
