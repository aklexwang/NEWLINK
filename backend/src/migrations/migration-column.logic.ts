export function isSqliteDriver(type: string): boolean {
  return type === 'sqlite' || type === 'better-sqlite3';
}

/** TypeORM TableColumn default. SQLite 는 0/1, Postgres 는 false/true 리터럴. */
export function migrationBoolDefault(
  sqlite: boolean,
  value: boolean,
): string {
  if (sqlite) return value ? '1' : '0';
  return value ? 'true' : 'false';
}

/** 엔티티 dateTimeColumnType() 과 같음 */
export function migrationDateTimeType(sqlite: boolean): string {
  return sqlite ? 'datetime' : 'timestamptz';
}
