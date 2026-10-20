/**
 * 로컬 SQLite → 운영 Postgres 1회성 데이터 이전.
 *
 *   npm run migrate:data -- --dry-run
 *   npm run migrate:data
 *
 * TARGET_DATABASE_URL 은 backend/.env.migrate 에서만 읽는다.
 * dry-run 은 대상 DB에 연결하지 않는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { Client } from 'pg';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const MIGRATE_ENV = path.join(BACKEND_ROOT, '.env.migrate');
const DEFAULT_SQLITE = path.join(BACKEND_ROOT, 'data', 'newlink.sqlite');

type ColKind = 'id' | 'text' | 'int' | 'real' | 'bool' | 'date' | 'bigint';

type TableSpec = {
  table: string;
  /** Postgres/SQLite 공통 컬럼명(스네이크) */
  columns: { name: string; kind: ColKind }[];
  pk: string;
  /** categories: 같은 name 이면 건너뜀 */
  skipIfSameName?: boolean;
};

const TABLES: TableSpec[] = [
  {
    table: 'categories',
    pk: 'id',
    skipIfSameName: true,
    columns: [
      { name: 'id', kind: 'id' },
      { name: 'name', kind: 'text' },
      { name: 'emoji', kind: 'text' },
      { name: 'icon_url', kind: 'text' },
      { name: 'sort_order', kind: 'int' },
      { name: 'is_active', kind: 'bool' },
      { name: 'created_at', kind: 'date' },
      { name: 'updated_at', kind: 'date' },
    ],
  },
  {
    table: 'users',
    pk: 'telegram_id',
    columns: [
      { name: 'telegram_id', kind: 'bigint' },
      { name: 'first_name', kind: 'text' },
      { name: 'username', kind: 'text' },
      { name: 'ton_wallet_address', kind: 'text' },
      { name: 'is_registered', kind: 'bool' },
      { name: 'is_blocked', kind: 'bool' },
      { name: 'created_at', kind: 'date' },
      { name: 'updated_at', kind: 'date' },
    ],
  },
  {
    table: 'channels',
    pk: 'id',
    columns: [
      { name: 'id', kind: 'id' },
      { name: 'title', kind: 'text' },
      { name: 'link', kind: 'text' },
      { name: 'link_type', kind: 'text' },
      { name: 'category', kind: 'text' },
      { name: 'description', kind: 'text' },
      { name: 'recommend_count', kind: 'int' },
      { name: 'status', kind: 'text' },
      { name: 'is_promoted', kind: 'bool' },
      { name: 'promoted_until', kind: 'date' },
      { name: 'promotion_client_telegram_id', kind: 'bigint' },
      { name: 'promotion_client_name', kind: 'text' },
      { name: 'promotion_ton_amount', kind: 'real' },
      { name: 'promotion_sort_order', kind: 'int' },
      { name: 'submitted_by', kind: 'bigint' },
      { name: 'avatar_url', kind: 'text' },
      { name: 'avatar_approved', kind: 'bool' },
      { name: 'member_count', kind: 'int' },
      { name: 'username', kind: 'text' },
      { name: 'telegram_chat_id', kind: 'bigint' },
      { name: 'first_observed_at', kind: 'date' },
      { name: 'last_collected_at', kind: 'date' },
      { name: 'collect_status', kind: 'text' },
      { name: 'collect_error', kind: 'text' },
      { name: 'collect_fail_count', kind: 'int' },
      { name: 'score', kind: 'int' },
      { name: 'grade', kind: 'text' },
      { name: 'view_rate', kind: 'real' },
      { name: 'growth_24h', kind: 'real' },
      { name: 'growth_7d', kind: 'real' },
      { name: 'growth_30d', kind: 'real' },
      { name: 'median_views_7d', kind: 'int' },
      { name: 'posts_7d', kind: 'int' },
      { name: 'observed_days', kind: 'int' },
      { name: 'is_verified', kind: 'bool' },
      { name: 'verified_at', kind: 'date' },
      { name: 'verified_owner_telegram_id', kind: 'bigint' },
      { name: 'reward_ton_amount', kind: 'real' },
      { name: 'reward_usd_amount', kind: 'real' },
      { name: 'reward_ton_usd_rate', kind: 'real' },
      { name: 'reward_paid_at', kind: 'date' },
      { name: 'reward_wallet', kind: 'text' },
      { name: 'created_at', kind: 'date' },
      { name: 'updated_at', kind: 'date' },
    ],
  },
  {
    table: 'channel_favorites',
    pk: 'id',
    columns: [
      { name: 'id', kind: 'id' },
      { name: 'user_id', kind: 'bigint' },
      { name: 'channel_id', kind: 'id' },
      { name: 'created_at', kind: 'date' },
    ],
  },
  {
    table: 'channel_recommendations',
    pk: 'id',
    columns: [
      { name: 'id', kind: 'id' },
      { name: 'user_id', kind: 'bigint' },
      { name: 'channel_id', kind: 'id' },
      { name: 'created_at', kind: 'date' },
    ],
  },
  {
    table: 'ton_payments',
    pk: 'id',
    columns: [
      { name: 'id', kind: 'id' },
      { name: 'paid_at', kind: 'date' },
      { name: 'amount', kind: 'real' },
      { name: 'wallet', kind: 'text' },
      { name: 'telegram_id', kind: 'bigint' },
      { name: 'reporter_name', kind: 'text' },
      { name: 'channel_id', kind: 'id' },
      { name: 'channel_title', kind: 'text' },
      { name: 'channel_link', kind: 'text' },
      { name: 'memo', kind: 'text' },
      { name: 'method', kind: 'text' },
    ],
  },
  {
    table: 'channel_import_candidates',
    pk: 'id',
    columns: [
      { name: 'id', kind: 'id' },
      { name: 'link', kind: 'text' },
      { name: 'title', kind: 'text' },
      { name: 'category', kind: 'text' },
      { name: 'category_ai_suggested', kind: 'text' },
      { name: 'category_confidence', kind: 'real' },
      { name: 'category_reviewed', kind: 'bool' },
      { name: 'category_source', kind: 'text' },
      { name: 'link_type', kind: 'text' },
      { name: 'participants_count', kind: 'int' },
      { name: 'avatar_url', kind: 'text' },
      { name: 'source', kind: 'text' },
      { name: 'status', kind: 'text' },
      { name: 'published_channel_id', kind: 'id' },
      { name: 'fetched_at', kind: 'date' },
      { name: 'published_at', kind: 'date' },
      { name: 'updated_at', kind: 'date' },
    ],
  },
];

const SKIP_STATS = [
  'channel_snapshots',
  'channel_posts',
  'channel_scores',
  'channel_events',
];

const REDACT_KEYS = new Set([
  'first_name',
  'username',
  'ton_wallet_address',
  'wallet',
  'reward_wallet',
  'telegram_id',
  'user_id',
  'submitted_by',
  'promotion_client_telegram_id',
  'promotion_client_name',
  'verified_owner_telegram_id',
  'reporter_name',
  'memo',
  'description',
]);

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function isDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return Boolean(value);
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toReal(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return s.length === 0 ? null : s;
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value);
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Postgres bigint은 문자열로 넘겨 JS 정밀도 문제를 피한다. */
function toBigint(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!/^-?\d+$/.test(s)) return null;
  return s;
}

function convertValue(
  kind: ColKind,
  value: unknown,
): string | number | boolean | Date | null {
  switch (kind) {
    case 'id':
      return toText(value);
    case 'text':
      return toText(value);
    case 'int':
      return toInt(value);
    case 'real':
      return toReal(value);
    case 'bool':
      return toBool(value, false);
    case 'date':
      return toDate(value);
    case 'bigint':
      return toBigint(value);
    default:
      return null;
  }
}

function convertRow(
  spec: TableSpec,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of spec.columns) {
    out[col.name] = convertValue(col.kind, raw[col.name]);
  }
  return out;
}

function redactSample(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (REDACT_KEYS.has(key)) {
      out[key] = value === null || value === undefined ? null : '[redacted]';
      continue;
    }
    if (value instanceof Date) {
      out[key] = value.toISOString();
      continue;
    }
    if (typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function sqliteColumns(db: Database.Database, table: string): Set<string> {
  const info = db.prepare(`PRAGMA table_info("${table}")`).all() as {
    name: string;
  }[];
  return new Set(info.map((c) => c.name));
}

function readSqliteRows(
  db: Database.Database,
  spec: TableSpec,
): Record<string, unknown>[] {
  const present = sqliteColumns(db, spec.table);
  const cols = spec.columns.filter((c) => present.has(c.name));
  if (cols.length === 0) return [];
  const sql = `SELECT ${cols.map((c) => `"${c.name}"`).join(', ')} FROM "${spec.table}"`;
  return db.prepare(sql).all() as Record<string, unknown>[];
}

function pkOf(spec: TableSpec, row: Record<string, unknown>): string {
  const v = row[spec.pk];
  return v === null || v === undefined ? '' : String(v);
}

async function loadExisting(
  client: Client,
  spec: TableSpec,
): Promise<{ ids: Set<string>; names: Set<string> }> {
  const ids = new Set<string>();
  const names = new Set<string>();
  const idRes = await client.query(`SELECT "${spec.pk}" AS pk FROM "${spec.table}"`);
  for (const row of idRes.rows as { pk: unknown }[]) {
    if (row.pk !== null && row.pk !== undefined) ids.add(String(row.pk));
  }
  if (spec.skipIfSameName) {
    const nameRes = await client.query(`SELECT name FROM "${spec.table}"`);
    for (const row of nameRes.rows as { name: unknown }[]) {
      if (typeof row.name === 'string') names.add(row.name);
    }
  }
  return { ids, names };
}

function shouldSkip(
  spec: TableSpec,
  row: Record<string, unknown>,
  existing: { ids: Set<string>; names: Set<string> },
): boolean {
  const pk = pkOf(spec, row);
  if (pk && existing.ids.has(pk)) return true;
  if (spec.skipIfSameName && typeof row.name === 'string' && existing.names.has(row.name)) {
    return true;
  }
  return false;
}

async function insertRow(
  client: Client,
  spec: TableSpec,
  row: Record<string, unknown>,
): Promise<void> {
  const cols = spec.columns.map((c) => c.name);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO "${spec.table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
  const values = cols.map((c) => row[c] ?? null);
  await client.query(sql, values);
}

async function migrateLive(
  sqlite: Database.Database,
  targetUrl: string,
): Promise<void> {
  const client = new Client({
    connectionString: targetUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const spec of TABLES) {
      const existing = await loadExisting(client, spec);
      const rawRows = readSqliteRows(sqlite, spec);
      let inserted = 0;
      let skipped = 0;
      for (const raw of rawRows) {
        const row = convertRow(spec, raw);
        if (shouldSkip(spec, row, existing)) {
          skipped += 1;
          continue;
        }
        await insertRow(client, spec, row);
        inserted += 1;
        const pk = pkOf(spec, row);
        if (pk) existing.ids.add(pk);
        if (spec.skipIfSameName && typeof row.name === 'string') {
          existing.names.add(row.name);
        }
      }
      console.log(
        `${spec.table}: 추가 ${inserted} / 건너뜀 ${skipped} / 실패 0`,
      );
    }
    await client.query('COMMIT');
    console.log('커밋 완료.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('실패 — 전체를 되돌렸습니다.');
    throw err;
  } finally {
    await client.end();
  }
}

function migrateDryRun(sqlite: Database.Database): void {
  console.log('dry-run: 대상 Postgres에 연결하지 않습니다.');
  console.log(`건너뛸 stats 테이블: ${SKIP_STATS.join(', ')}`);
  for (const spec of TABLES) {
    const rawRows = readSqliteRows(sqlite, spec);
    console.log(`${spec.table}: 원본 ${rawRows.length}행`);
    if (rawRows.length === 0) continue;
    const converted = convertRow(spec, rawRows[0]);
    console.log(
      `  샘플(마스킹): ${JSON.stringify(redactSample(converted))}`,
    );
  }
}

async function main(): Promise<void> {
  const dryRun = isDryRun(process.argv.slice(2));
  loadEnvFile(MIGRATE_ENV);

  const sqlitePath = path.resolve(
    process.env.SQLITE_PATH?.trim() || DEFAULT_SQLITE,
  );
  if (!fs.existsSync(sqlitePath)) {
    throw new Error(`SQLite 파일이 없습니다: ${sqlitePath}`);
  }

  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    console.log(`원본 SQLite: ${sqlitePath}`);
    if (dryRun) {
      migrateDryRun(sqlite);
      return;
    }
    const targetUrl = (process.env.TARGET_DATABASE_URL ?? '').trim();
    if (!targetUrl) {
      throw new Error(
        'TARGET_DATABASE_URL 이 없습니다. backend/.env.migrate 에 넣어 주세요.',
      );
    }
    await migrateLive(sqlite, targetUrl);
  } finally {
    sqlite.close();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 1;
});
