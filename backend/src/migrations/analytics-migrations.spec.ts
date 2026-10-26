import { DataSource, MigrationInterface } from 'typeorm';
import { AddSearchTerms1761360000000 } from './1761360000000-AddSearchTerms';
import { AddSearchLogs1761370000000 } from './1761370000000-AddSearchLogs';
import { AddTelegramOpens1761380000000 } from './1761380000000-AddTelegramOpens';

interface Case {
  label: string;
  migration: () => MigrationInterface;
  tables: string[];
  insert: string[];
}

const cases: Case[] = [
  {
    label: 'AddSearchTerms1761360000000',
    migration: () => new AddSearchTerms1761360000000(),
    tables: ['search_terms'],
    insert: [
      "INSERT INTO search_terms (id, kind, term, term_normalized, created_at, updated_at) VALUES ('t1', 'block', '마약', '마약', '2026-01-01', '2026-01-01')",
    ],
  },
  {
    label: 'AddSearchLogs1761370000000',
    migration: () => new AddSearchLogs1761370000000(),
    tables: ['search_logs', 'search_daily_stats'],
    insert: [
      "INSERT INTO search_logs (id, query_normalized, query_raw, searched_on, created_at) VALUES ('l1', '코인', '코인', '2026-01-01', '2026-01-01')",
      "INSERT INTO search_daily_stats (stat_date, query_normalized) VALUES ('2026-01-01', '코인')",
    ],
  },
  {
    label: 'AddTelegramOpens1761380000000',
    migration: () => new AddTelegramOpens1761380000000(),
    tables: ['telegram_open_recent', 'channel_open_daily'],
    insert: [
      "INSERT INTO telegram_open_recent (channel_id, visitor_hash, last_counted_at) VALUES ('c1', 'h1', '2026-01-01')",
      "INSERT INTO channel_open_daily (channel_id, open_date) VALUES ('c1', '2026-01-01')",
    ],
  },
];

describe.each(cases)('$label up/down/up', (testCase) => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('up → down → up 이 모두 성공하고 두 번 up 해도 안전하다', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = testCase.migration();

    await migration.up(runner);
    await migration.up(runner);
    for (const table of testCase.tables) {
      expect(await runner.hasTable(table)).toBe(true);
    }
    for (const sql of testCase.insert) await dataSource.query(sql);

    await migration.down(runner);
    for (const table of testCase.tables) {
      expect(await runner.hasTable(table)).toBe(false);
    }
    await migration.down(runner);

    await migration.up(runner);
    for (const table of testCase.tables) {
      expect(await runner.hasTable(table)).toBe(true);
      const rows = await dataSource.query(`SELECT COUNT(*) AS n FROM ${table}`);
      expect(Number(rows[0].n)).toBe(0);
    }
    await runner.release();
  });
});

describe('제약 조건', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
    });
    await dataSource.initialize();
    const runner = dataSource.createQueryRunner();
    await new AddSearchTerms1761360000000().up(runner);
    await new AddSearchLogs1761370000000().up(runner);
    await new AddTelegramOpens1761380000000().up(runner);
    await runner.release();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('금지어는 같은 종류·같은 정규화 값을 중복 저장할 수 없다', async () => {
    const insert = (id: string, kind: string) =>
      dataSource.query(
        `INSERT INTO search_terms (id, kind, term, term_normalized, created_at, updated_at) VALUES ('${id}', '${kind}', '마.약', '마약', '2026-01-01', '2026-01-01')`,
      );
    await insert('a', 'block');
    await expect(insert('b', 'block')).rejects.toThrow();
    await insert('c', 'allow');
  });

  it('enabled 기본값은 켜짐, blocked 기본값은 꺼짐', async () => {
    await dataSource.query(
      "INSERT INTO search_terms (id, kind, term, term_normalized, created_at, updated_at) VALUES ('a', 'block', '마약', '마약', '2026-01-01', '2026-01-01')",
    );
    await dataSource.query(
      "INSERT INTO search_logs (id, query_normalized, query_raw, searched_on, created_at) VALUES ('l', 'x', 'x', '2026-01-01', '2026-01-01')",
    );
    const term = await dataSource.query('SELECT enabled FROM search_terms');
    const log = await dataSource.query(
      'SELECT blocked, result_count FROM search_logs',
    );
    expect(Number(term[0].enabled)).toBe(1);
    expect(Number(log[0].blocked)).toBe(0);
    expect(Number(log[0].result_count)).toBe(0);
  });

  it('일별 집계·이동 수는 복합 기본키로 중복 행을 막는다', async () => {
    await dataSource.query(
      "INSERT INTO search_daily_stats (stat_date, query_normalized) VALUES ('2026-01-01', 'a')",
    );
    await expect(
      dataSource.query(
        "INSERT INTO search_daily_stats (stat_date, query_normalized) VALUES ('2026-01-01', 'a')",
      ),
    ).rejects.toThrow();
    await dataSource.query(
      "INSERT INTO channel_open_daily (channel_id, open_date) VALUES ('c', '2026-01-01')",
    );
    await expect(
      dataSource.query(
        "INSERT INTO channel_open_daily (channel_id, open_date) VALUES ('c', '2026-01-01')",
      ),
    ).rejects.toThrow();
  });
});
