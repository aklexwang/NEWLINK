import { dateTimeColumnType, isPostgresConfig } from './db-types';

describe('db-types', () => {
  it('DATABASE_URL이 있으면 Postgres로 본다', () => {
    expect(
      isPostgresConfig({ DATABASE_URL: 'postgresql://localhost/newlink' }),
    ).toBe(true);
  });

  it('DATABASE_TYPE이 postgres/postgresql이면 Postgres로 본다', () => {
    expect(isPostgresConfig({ DATABASE_TYPE: 'postgres' })).toBe(true);
    expect(isPostgresConfig({ DATABASE_TYPE: 'PostgreSQL' })).toBe(true);
  });

  it('둘 다 없으면 SQLite로 본다', () => {
    expect(
      isPostgresConfig({ DATABASE_URL: '', DATABASE_TYPE: 'sqlite' }),
    ).toBe(false);
    expect(isPostgresConfig({})).toBe(false);
  });

  it('Postgres면 timestamptz, SQLite면 datetime을 쓴다', () => {
    expect(dateTimeColumnType({ DATABASE_URL: 'postgres://x' })).toBe(
      'timestamptz',
    );
    expect(dateTimeColumnType({ DATABASE_TYPE: 'sqlite' })).toBe('datetime');
  });
});
