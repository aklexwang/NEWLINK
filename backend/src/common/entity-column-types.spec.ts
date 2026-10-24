const ENTITY_IMPORTS = [
  '../channels/channel.entity',
  '../channels/channel-favorite.entity',
  '../channels/channel-recommendation.entity',
  '../users/user.entity',
  '../categories/category.entity',
  '../payments/ton-payment.entity',
  '../auto-manage/channel-import-candidate.entity',
  '../stats/channel-event.entity',
  '../stats/channel-post.entity',
  '../stats/channel-score.entity',
  '../stats/channel-snapshot.entity',
  '../stats/discovered-username.entity',
  '../admin/admin-inspect-job.entity',
  '../admin/admin-inspect-item.entity',
  '../stats/discovery-keyword.entity',
  '../payments/reward-settings.entity',
  '../payments/payout-method.entity',
  '../payments/payout-record.entity',
];

function loadEntitiesForEnv(kind: 'postgres' | 'sqlite') {
  if (kind === 'postgres') {
    process.env.DATABASE_URL =
      'postgresql://newlink:newlink@localhost:5432/newlink';
    process.env.DATABASE_TYPE = 'postgres';
  } else {
    process.env.DATABASE_URL = '';
    process.env.DATABASE_TYPE = 'sqlite';
  }

  let driver: {
    normalizeType: (column: { type: string }) => string;
    supportedDataTypes: string[];
  };
  let columns: {
    options: { type?: unknown };
    target: unknown;
    propertyName: string;
  }[] = [];
  let resolvedDateType: string | undefined;

  jest.isolateModules(() => {
    const globalScope = globalThis as { typeormMetadataArgsStorage?: unknown };
    delete globalScope.typeormMetadataArgsStorage;

    const { dateTimeColumnType } =
      require('./db-types') as typeof import('./db-types');
    resolvedDateType = dateTimeColumnType();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const typeorm = require('typeorm') as typeof import('typeorm');
    for (const path of ENTITY_IMPORTS) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require(path);
    }

    const ds =
      kind === 'postgres'
        ? new typeorm.DataSource({
            type: 'postgres',
            url: 'postgresql://newlink:newlink@localhost:5432/newlink',
            entities: [],
          })
        : new typeorm.DataSource({
            type: 'better-sqlite3',
            database: ':memory:',
            entities: [],
          });

    driver = ds.driver;
    columns = typeorm.getMetadataArgsStorage().columns;
  });

  return { driver, columns, resolvedDateType };
}

describe('엔티티 컬럼 타입이 드라이버 supportedDataTypes에 포함된다', () => {
  const originalUrl = process.env.DATABASE_URL;
  const originalType = process.env.DATABASE_TYPE;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
    if (originalType === undefined) delete process.env.DATABASE_TYPE;
    else process.env.DATABASE_TYPE = originalType;
    jest.resetModules();
  });

  it.each(['postgres', 'sqlite'] as const)('%s', (kind) => {
    const { driver, columns, resolvedDateType } = loadEntitiesForEnv(kind);
    expect(resolvedDateType).toBe(
      kind === 'postgres' ? 'timestamptz' : 'datetime',
    );
    expect(columns.length).toBeGreaterThan(0);

    const unsupported: string[] = [];
    for (const column of columns) {
      const rawType = column.options.type;
      if (rawType == null || typeof rawType === 'function') {
        continue;
      }
      const typeName = String(rawType);
      const normalized = driver.normalizeType({ type: typeName });
      if (!driver.supportedDataTypes.includes(normalized)) {
        const target =
          typeof column.target === 'function'
            ? column.target.name
            : String(column.target);
        unsupported.push(
          `${target}.${column.propertyName} (${typeName} → ${normalized})`,
        );
      }
    }

    expect(unsupported).toEqual([]);
  });
});
