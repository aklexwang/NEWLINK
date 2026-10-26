import { DataSource } from 'typeorm';
import { AddRewardToggleLog1761450000000 } from './1761450000000-AddRewardToggleLog';

describe('AddRewardToggleLog1761450000000', () => {
  it('up/down/up', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    await dataSource.query(
      'CREATE TABLE reward_settings (id varchar(36) PRIMARY KEY, enabled boolean NOT NULL DEFAULT 1)',
    );
    const runner = dataSource.createQueryRunner();
    try {
      const m = new AddRewardToggleLog1761450000000();
      await m.up(runner);
      await m.up(runner);
      expect(
        await runner.hasColumn('reward_settings', 'enabled_changed_at'),
      ).toBe(true);
      await dataSource.query(
        "INSERT INTO reward_toggle_logs (id, enabled) VALUES ('a', 0)",
      );
      const [row] = await dataSource.query(
        'SELECT changed_at FROM reward_toggle_logs',
      );
      expect(row.changed_at).toBeTruthy();
      await m.down(runner);
      expect(await runner.hasTable('reward_toggle_logs')).toBe(false);
      expect(
        await runner.hasColumn('reward_settings', 'enabled_changed_at'),
      ).toBe(false);
      await m.up(runner);
      expect(await runner.hasTable('reward_toggle_logs')).toBe(true);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});
