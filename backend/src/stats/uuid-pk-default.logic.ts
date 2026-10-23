/**
 * 마이그레이션 createTable 로 만든 uuid PK 테이블.
 * TypeORM @PrimaryGeneratedColumn('uuid') 는 Postgres insert 때 id 를 생략하므로
 * 컬럼 DEFAULT 가 없으면 NOT NULL 위반이 난다.
 * discovered_usernames 는 username PK 라 제외.
 */
export const MIGRATION_UUID_PK_TABLES = [
  'channel_snapshots',
  'channel_posts',
  'channel_scores',
  'channel_events',
  'stats_runs',
] as const;

export const MIGRATION_USERNAME_PK_TABLES = ['discovered_usernames'] as const;

export function postgresUuidIdHasGeneratedDefault(
  columnDefault: string | null | undefined,
): boolean {
  return /gen_random_uuid\s*\(|uuid_generate_v4\s*\(/i.test(
    columnDefault ?? '',
  );
}

export function postgresUuidIdDefaultSql(table: string): string {
  return `ALTER TABLE "${table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`;
}

export function postgresUuidIdDropDefaultSql(table: string): string {
  return `ALTER TABLE "${table}" ALTER COLUMN "id" DROP DEFAULT`;
}
