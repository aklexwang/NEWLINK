/** TypeORM 날짜 컬럼 — Postgres와 SQLite에서 각각 지원하는 타입 */
export type DateTimeColumnType = 'timestamptz' | 'datetime';

export function isPostgresConfig(
  env: { DATABASE_URL?: string; DATABASE_TYPE?: string } = process.env,
): boolean {
  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  const dbType = (env.DATABASE_TYPE ?? '').trim().toLowerCase();
  return (
    Boolean(databaseUrl) || dbType === 'postgres' || dbType === 'postgresql'
  );
}

export function dateTimeColumnType(
  env: { DATABASE_URL?: string; DATABASE_TYPE?: string } = process.env,
): DateTimeColumnType {
  return isPostgresConfig(env) ? 'timestamptz' : 'datetime';
}
