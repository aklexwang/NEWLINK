import {
  isSqliteDriver,
  migrationBoolDefault,
  migrationDateTimeType,
} from './migration-column.logic';

describe('migration-column.logic', () => {
  it('Postgres boolean 기본값은 true/false 리터럴이다', () => {
    expect(isSqliteDriver('postgres')).toBe(false);
    expect(isSqliteDriver('postgresql')).toBe(false);
    expect(migrationBoolDefault(false, false)).toBe('false');
    expect(migrationBoolDefault(false, true)).toBe('true');
  });

  it('SQLite boolean 기본값은 0/1 이다', () => {
    expect(isSqliteDriver('better-sqlite3')).toBe(true);
    expect(migrationBoolDefault(true, false)).toBe('0');
    expect(migrationBoolDefault(true, true)).toBe('1');
  });

  it('날짜 타입은 엔티티 dateTimeColumnType 과 같다', () => {
    expect(migrationDateTimeType(true)).toBe('datetime');
    expect(migrationDateTimeType(false)).toBe('timestamptz');
  });
});
