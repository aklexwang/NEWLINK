import { DataSource } from 'typeorm';
import { AddCategorySuggestionsAndNotifications1761440000000 } from './1761440000000-AddCategorySuggestionsAndNotifications';

describe('AddCategorySuggestionsAndNotifications1761440000000', () => {
  it('up/down/up', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    await dataSource.query(
      'CREATE TABLE channels (id varchar(36) PRIMARY KEY, title varchar(255))',
    );
    await dataSource.query(
      "INSERT INTO channels (id, title) VALUES ('a', 'x')",
    );
    const runner = dataSource.createQueryRunner();
    try {
      const m = new AddCategorySuggestionsAndNotifications1761440000000();
      await m.up(runner);
      await m.up(runner);
      expect(await runner.hasColumn('channels', 'suggested_category')).toBe(
        true,
      );
      expect(await runner.hasTable('admin_notifications')).toBe(true);
      await dataSource.query(
        "INSERT INTO admin_notifications (id, key, type, title) VALUES ('n', 'k', 't', '제목')",
      );
      await expect(
        dataSource.query(
          "INSERT INTO admin_notifications (id, key, type, title) VALUES ('n2', 'k', 't', '제목')",
        ),
      ).rejects.toThrow();
      await m.down(runner);
      expect(await runner.hasColumn('channels', 'suggested_category')).toBe(
        false,
      );
      expect(await runner.hasTable('admin_notifications')).toBe(false);
      await m.up(runner);
      expect(await runner.hasTable('admin_notifications')).toBe(true);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});
