import { DataSource } from 'typeorm';
import { AddLinkedChat1761410000000 } from './1761410000000-AddLinkedChat';

describe('AddLinkedChat1761410000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({ type: 'better-sqlite3', database: ':memory:' });
    await dataSource.initialize();
    await dataSource.query(
      "CREATE TABLE channels (id varchar(36) PRIMARY KEY, title varchar(255) NOT NULL)",
    );
    await dataSource.query("INSERT INTO channels (id, title) VALUES ('a', '채널')");
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function columns(): Promise<string[]> {
    const rows = (await dataSource.query('PRAGMA table_info(channels)')) as Array<{ name: string }>;
    return rows.map((row) => row.name);
  }

  it('up/down/up: 칸 4개를 넣고 빼고 다시 넣는다, 기존 행은 NULL', async () => {
    const migration = new AddLinkedChat1761410000000();
    const runner = dataSource.createQueryRunner();
    try {
      await migration.up(runner);
      await migration.up(runner);
      expect(await columns()).toEqual(
        expect.arrayContaining([
          'linked_chat_telegram_id',
          'linked_chat_title',
          'linked_chat_username',
          'linked_chat_created_on',
        ]),
      );
      const [row] = (await dataSource.query('SELECT * FROM channels')) as Array<Record<string, unknown>>;
      expect(row.linked_chat_telegram_id).toBeNull();
      await migration.down(runner);
      expect(await columns()).not.toContain('linked_chat_title');
      await migration.up(runner);
      expect(await columns()).toContain('linked_chat_created_on');
    } finally {
      await runner.release();
    }
  });
});
