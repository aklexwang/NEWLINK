import { DataSource } from 'typeorm';
import {
  AddChannelNextCollectAt1761400000000,
  NEXT_COLLECT_AT_INDEX,
} from './1761400000000-AddChannelNextCollectAt';

describe('AddChannelNextCollectAt1761400000000', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    await dataSource.query(
      'CREATE TABLE channels (id varchar(36) PRIMARY KEY, title varchar(255) NOT NULL, collect_fail_count integer NOT NULL DEFAULT 0)',
    );
    await dataSource.query(
      "INSERT INTO channels (id, title, collect_fail_count) VALUES ('a', '정상', 0), ('b', '사라지는 중', 2)",
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function rows<T>(sql: string): Promise<T[]> {
    return await dataSource.query(sql);
  }

  async function indexNames(): Promise<string[]> {
    const runner = dataSource.createQueryRunner();
    try {
      const table = await runner.getTable('channels');
      return (table?.indices ?? []).map((index) => index.name ?? '');
    } finally {
      await runner.release();
    }
  }

  it('up → down → up 이 안전하고 기존 행은 바로 수집 대상(NULL)이 된다', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new AddChannelNextCollectAt1761400000000();

    await migration.up(runner);
    // 두 번 돌려도 깨지지 않는다
    await migration.up(runner);
    expect(await runner.hasColumn('channels', 'next_collect_at')).toBe(true);
    expect(await runner.hasColumn('channels', 'collect_gone_count')).toBe(true);
    expect(await indexNames()).toEqual([NEXT_COLLECT_AT_INDEX]);

    const afterUp = await rows<{ n: string | null; g: number }>(
      'SELECT next_collect_at AS n, collect_gone_count AS g FROM channels ORDER BY id',
    );
    expect(afterUp.map((r) => r.n)).toEqual([null, null]);
    // 지금까지 세던 not_found 횟수가 gone 칸으로 옮겨진다
    expect(afterUp.map((r) => Number(r.g))).toEqual([0, 2]);

    await migration.down(runner);
    expect(await runner.hasColumn('channels', 'next_collect_at')).toBe(false);
    expect(await runner.hasColumn('channels', 'collect_gone_count')).toBe(
      false,
    );
    expect(await indexNames()).toEqual([]);
    // 원래 칸과 데이터는 그대로
    const afterDown = await rows<{ f: number }>(
      'SELECT collect_fail_count AS f FROM channels ORDER BY id',
    );
    expect(afterDown.map((r) => Number(r.f))).toEqual([0, 2]);

    await migration.up(runner);
    expect(await runner.hasColumn('channels', 'next_collect_at')).toBe(true);
    expect(await indexNames()).toEqual([NEXT_COLLECT_AT_INDEX]);
    const afterSecondUp = await rows<{ g: number }>(
      'SELECT collect_gone_count AS g FROM channels ORDER BY id',
    );
    expect(afterSecondUp.map((r) => Number(r.g))).toEqual([0, 2]);

    await runner.release();
  });

  it('next_collect_at 에 시각을 넣고 조회할 수 있다', async () => {
    const runner = dataSource.createQueryRunner();
    await new AddChannelNextCollectAt1761400000000().up(runner);
    await dataSource.query(
      "UPDATE channels SET next_collect_at = '2026-10-26 03:00:00' WHERE id = 'a'",
    );
    const due = await rows<{ id: string }>(
      "SELECT id FROM channels WHERE next_collect_at IS NULL OR next_collect_at <= '2026-10-26 04:00:00' ORDER BY id",
    );
    expect(due.map((r) => r.id)).toEqual(['a', 'b']);
    await runner.release();
  });
});
