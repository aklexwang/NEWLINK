import { DataSource } from 'typeorm';
import { AddCategoryProposals1761430000000 } from './1761430000000-AddCategoryProposals';

describe('AddCategoryProposals1761430000000', () => {
  it('up/down/up: 표를 만들고 지우고 다시 만든다', async () => {
    const dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    try {
      const migration = new AddCategoryProposals1761430000000();
      await migration.up(runner);
      await migration.up(runner);
      expect(await runner.hasTable('category_proposals')).toBe(true);
      await dataSource.query(
        "INSERT INTO category_proposals (id, batch_id, channel_id, before_category, after_category, source) VALUES ('p', 'b', 'c', '성인', '홍보', 'ai')",
      );
      const [row] = (await dataSource.query(
        'SELECT status, created_at FROM category_proposals',
      )) as Array<{
        status: string;
        created_at: string;
      }>;
      expect(row.status).toBe('pending');
      expect(row.created_at).toBeTruthy();
      await migration.down(runner);
      expect(await runner.hasTable('category_proposals')).toBe(false);
      await migration.up(runner);
      expect(await runner.hasTable('category_proposals')).toBe(true);
    } finally {
      await runner.release();
      await dataSource.destroy();
    }
  });
});
