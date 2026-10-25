import { DataSource } from 'typeorm';
import { AddTitleLocked1761390000000 } from './1761390000000-AddTitleLocked';

describe('AddTitleLocked1761390000000', () => {
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

  it('up → down → up 이 안전하고 기존 행은 title_locked=false 가 된다', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new AddTitleLocked1761390000000();

    await migration.up(runner);
    await migration.up(runner);
    expect(await runner.hasColumn('channels', 'title_locked')).toBe(true);
    let rows = (await dataSource.query(
      'SELECT title_locked AS v FROM channels',
    )) as Array<{ v: number }>;
    expect(Number(rows[0].v)).toBe(0);

    await migration.down(runner);
    expect(await runner.hasColumn('channels', 'title_locked')).toBe(false);

    await migration.up(runner);
    expect(await runner.hasColumn('channels', 'title_locked')).toBe(true);
    rows = (await dataSource.query(
      'SELECT title_locked AS v FROM channels',
    )) as Array<{ v: number }>;
    expect(Number(rows[0].v)).toBe(0);

    await runner.release();
  });
});
