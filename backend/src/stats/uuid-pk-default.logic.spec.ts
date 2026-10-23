import { readFileSync } from 'fs';
import { join } from 'path';
import { newStatsRunInsert } from './stats-run.logic';
import {
  MIGRATION_USERNAME_PK_TABLES,
  MIGRATION_UUID_PK_TABLES,
  postgresUuidIdDefaultSql,
  postgresUuidIdHasGeneratedDefault,
} from './uuid-pk-default.logic';

const srcRoot = join(__dirname, '..');

function readSrc(rel: string): string {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

describe('uuid PK 기본값', () => {
  it('run insert 는 DB 기본값 없이 id 를 직접 넣는다', () => {
    const row = newStatsRunInsert({
      total: 10,
      startedAt: new Date('2026-10-23T00:00:00.000Z'),
    });
    expect(row.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(row.total).toBe(10);
    expect(row.finishedAt).toBeNull();
  });

  it('마이그레이션으로 만든 uuid PK 테이블은 엔티티가 uuid 생성이고 기존 SQL 에 DEFAULT 가 없다', () => {
    const entityByTable: Record<string, string> = {
      channel_snapshots: 'stats/channel-snapshot.entity.ts',
      channel_posts: 'stats/channel-post.entity.ts',
      channel_scores: 'stats/channel-score.entity.ts',
      channel_events: 'stats/channel-event.entity.ts',
      stats_runs: 'stats/stats-run.entity.ts',
    };
    const createMigrations = [
      'migrations/1760852400000-AddChannelStats.ts',
      'migrations/1761260000000-AddStatsRuns.ts',
    ].map(readSrc);
    const createSql = createMigrations.join('\n');

    expect(MIGRATION_UUID_PK_TABLES).toEqual(
      expect.arrayContaining(Object.keys(entityByTable)),
    );
    for (const [table, entityFile] of Object.entries(entityByTable)) {
      const entity = readSrc(entityFile);
      expect(entity).toContain(`@Entity('${table}')`);
      expect(entity).toContain("@PrimaryGeneratedColumn('uuid')");
      expect(createSql).toContain(`name: '${table}'`);
    }
    expect(createSql).not.toMatch(/gen_random_uuid|uuid_generate_v4/);
    expect(postgresUuidIdHasGeneratedDefault(null)).toBe(false);
  });

  it('discovered_usernames 는 username PK 라 uuid 기본값이 필요 없다', () => {
    const entity = readSrc('stats/discovered-username.entity.ts');
    const migration = readSrc('migrations/1761019200000-AddChannelDiscovery.ts');
    expect(entity).toContain("@Entity('discovered_usernames')");
    expect(entity).toContain('@PrimaryColumn');
    expect(entity).not.toContain('PrimaryGeneratedColumn');
    expect(migration).toContain("name: 'discovered_usernames'");
    expect(migration).toContain("name: 'username'");
    expect(MIGRATION_USERNAME_PK_TABLES).toContain('discovered_usernames');
    expect(MIGRATION_UUID_PK_TABLES).not.toContain('discovered_usernames');
  });

  it('새 마이그레이션은 Postgres 에만 gen_random_uuid 기본값을 단다', () => {
    const src = readSrc('migrations/1761270000000-AddUuidPkDefaults.ts');
    expect(src).toContain('isSqlite');
    expect(src).toMatch(/if \(isSqlite\(queryRunner\)\) return/);
    expect(src).toContain('MIGRATION_UUID_PK_TABLES');
    expect(src).toContain('postgresUuidIdDefaultSql');
    for (const table of MIGRATION_UUID_PK_TABLES) {
      expect(postgresUuidIdDefaultSql(table)).toBe(
        `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
      );
    }
    expect(src).not.toContain('discovered_usernames');
    expect(src).not.toContain('category_reports');
  });
});
