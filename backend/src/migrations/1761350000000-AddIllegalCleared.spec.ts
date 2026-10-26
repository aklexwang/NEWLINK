import { DataSource } from 'typeorm';
import { AddIllegalCleared1761350000000 } from './1761350000000-AddIllegalCleared';

describe('AddIllegalCleared1761350000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    await dataSource.query(
      'CREATE TABLE channels (id varchar(36) PRIMARY KEY, title varchar(255) NOT NULL)',
    );
    await dataSource.query(
      "INSERT INTO channels (id, title) VALUES ('a', '기존 채널')",
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('기존 행은 illegal_cleared=false, 푼 시각은 null 로 남고 두 번 돌려도 안전하다', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new AddIllegalCleared1761350000000();
    await migration.up(runner);
    await migration.up(runner);

    expect(await runner.hasColumn('channels', 'illegal_cleared')).toBe(true);
    expect(await runner.hasColumn('channels', 'illegal_cleared_at')).toBe(true);
    const rows = await dataSource.query(
      'SELECT illegal_cleared AS c, illegal_cleared_at AS at FROM channels',
    );
    expect(Number(rows[0].c)).toBe(0);
    expect(rows[0].at).toBeNull();

    await migration.down(runner);
    expect(await runner.hasColumn('channels', 'illegal_cleared')).toBe(false);
    expect(await runner.hasColumn('channels', 'illegal_cleared_at')).toBe(
      false,
    );
    await runner.release();
  });
});
