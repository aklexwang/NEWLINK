/**
 * 같은 username 채널을 하나로 합친다.
 *
 *   npm run merge:duplicates -- --dry-run
 *   npm run merge:duplicates -- --apply
 *
 * TARGET_DATABASE_URL 은 backend/.env.migrate 에서만 읽는다.
 * 기본은 dry-run. --apply 가 있을 때만 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  pickKeepChannel,
  type DuplicateKeepCandidate,
} from '../src/channels/merge-duplicate-channels.logic';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const MIGRATE_ENV = path.join(BACKEND_ROOT, '.env.migrate');

type ChannelRow = {
  id: string;
  title: string;
  username: string;
  is_verified: boolean;
  is_promoted: boolean;
  recommend_count: number;
  created_at: Date;
  collect_status: string | null;
  status: string;
};

type MoveSpec = {
  table: string;
  conflictCol: string | null;
  idCast: 'uuid' | 'text';
};

const MOVE_SPECS: MoveSpec[] = [
  { table: 'channel_favorites', conflictCol: 'user_id', idCast: 'uuid' },
  { table: 'channel_recommendations', conflictCol: 'user_id', idCast: 'uuid' },
  { table: 'ton_payments', conflictCol: null, idCast: 'text' },
  { table: 'channel_posts', conflictCol: 'message_id', idCast: 'uuid' },
  { table: 'channel_snapshots', conflictCol: 'captured_on', idCast: 'uuid' },
  { table: 'channel_scores', conflictCol: 'scored_on', idCast: 'uuid' },
  { table: 'channel_events', conflictCol: null, idCast: 'uuid' },
];

type MoveCounts = Record<string, { move: number; skip: number }>;

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

function redact(message: string): string {
  return message.replace(/postgresql:\/\/\S+/gi, '[redacted]');
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function isApply(argv: string[]): boolean {
  return argv.includes('--apply');
}

async function countMove(
  client: Client,
  spec: MoveSpec,
  keepId: string,
  fromIds: string[],
): Promise<{ move: number; skip: number }> {
  const totalRes = await client.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM ${spec.table} WHERE channel_id::text = ANY($1::text[])`,
    [fromIds],
  );
  const total = totalRes.rows[0]?.cnt ?? 0;
  if (!spec.conflictCol) {
    return { move: total, skip: 0 };
  }
  const moveRes = await client.query<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt
     FROM ${spec.table} src
     WHERE src.channel_id::text = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM ${spec.table} keep
         WHERE keep.channel_id::text = $2
           AND keep.${spec.conflictCol} = src.${spec.conflictCol}
       )`,
    [fromIds, keepId],
  );
  const move = moveRes.rows[0]?.cnt ?? 0;
  return { move, skip: total - move };
}

async function loadCounts(
  client: Client,
  ids: string[],
): Promise<Map<string, { favorites: number; posts: number }>> {
  const map = new Map<string, { favorites: number; posts: number }>();
  for (const id of ids) {
    map.set(id, { favorites: 0, posts: 0 });
  }
  const fav = await client.query<{ channel_id: string; cnt: number }>(
    `SELECT channel_id::text AS channel_id, COUNT(*)::int AS cnt
     FROM channel_favorites
     WHERE channel_id::text = ANY($1::text[])
     GROUP BY channel_id`,
    [ids],
  );
  const posts = await client.query<{ channel_id: string; cnt: number }>(
    `SELECT channel_id::text AS channel_id, COUNT(*)::int AS cnt
     FROM channel_posts
     WHERE channel_id::text = ANY($1::text[])
     GROUP BY channel_id`,
    [ids],
  );
  for (const row of fav.rows) {
    const cur = map.get(row.channel_id);
    if (cur) cur.favorites = row.cnt;
  }
  for (const row of posts.rows) {
    const cur = map.get(row.channel_id);
    if (cur) cur.posts = row.cnt;
  }
  return map;
}

function toCandidate(
  row: ChannelRow,
  counts: { favorites: number; posts: number },
): DuplicateKeepCandidate {
  return {
    id: row.id,
    title: row.title,
    isVerified: Boolean(row.is_verified),
    isPromoted: Boolean(row.is_promoted),
    favoriteCount: counts.favorites,
    recommendCount: Number(row.recommend_count) || 0,
    postCount: counts.posts,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

async function moveRows(
  client: Client,
  spec: MoveSpec,
  keepId: string,
  fromId: string,
): Promise<void> {
  const cast = spec.idCast;
  if (spec.conflictCol) {
    await client.query(
      `UPDATE ${spec.table} AS src
       SET channel_id = $1::${cast}
       WHERE src.channel_id::text = $2
         AND NOT EXISTS (
           SELECT 1 FROM ${spec.table} keep
           WHERE keep.channel_id::text = $1
             AND keep.${spec.conflictCol} = src.${spec.conflictCol}
         )`,
      [keepId, fromId],
    );
    await client.query(
      `DELETE FROM ${spec.table} WHERE channel_id::text = $1`,
      [fromId],
    );
    return;
  }
  await client.query(
    `UPDATE ${spec.table} SET channel_id = $1::${cast} WHERE channel_id::text = $2`,
    [keepId, fromId],
  );
}

async function applyGroup(
  client: Client,
  keepId: string,
  fromIds: string[],
): Promise<void> {
  for (const fromId of fromIds) {
    for (const spec of MOVE_SPECS) {
      await moveRows(client, spec, keepId, fromId);
    }
    await client.query(
      `INSERT INTO channel_events (id, channel_id, type, before, after, occurred_at)
       VALUES ($1::uuid, $2::uuid, 'merged_into', $2, $3, NOW())`,
      [randomUUID(), fromId, keepId],
    );
    await client.query(
      `UPDATE channels
       SET status = 'rejected',
           collect_status = 'merged',
           collect_error = NULL,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [fromId],
    );
  }
  await client.query(
    `UPDATE channels
     SET recommend_count = (
       SELECT COUNT(*)::int FROM channel_recommendations WHERE channel_id = $1::uuid
     ),
     updated_at = NOW()
     WHERE id = $1::uuid`,
    [keepId],
  );
}

function printGroup(
  username: string,
  keep: ChannelRow,
  fromRows: ChannelRow[],
  counts: MoveCounts,
): void {
  console.log(`\n@${username} (${fromRows.length + 1}개)`);
  console.log(
    `  남김: ${shortId(keep.id)}  ${keep.title}  인증=${keep.is_verified ? 'Y' : 'N'} 광고=${keep.is_promoted ? 'Y' : 'N'} 추천=${keep.recommend_count}`,
  );
  for (const row of fromRows) {
    console.log(`  합침: ${shortId(row.id)}  ${row.title}`);
  }
  const parts = MOVE_SPECS.map((spec) => {
    const c = counts[spec.table];
    const skip = c.skip > 0 ? ` 충돌폐기 ${c.skip}` : '';
    return `${spec.table} ${c.move}${skip}`;
  });
  console.log(`  옮김: ${parts.join(', ')}`);
}

async function run(): Promise<void> {
  loadEnvFile(MIGRATE_ENV);
  const apply = isApply(process.argv.slice(2));
  const url = (process.env.TARGET_DATABASE_URL ?? '').trim();
  if (!url) {
    throw new Error(
      'TARGET_DATABASE_URL 이 없습니다. backend/.env.migrate 에 넣어 주세요.',
    );
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    if (apply) {
      await client.query('BEGIN');
    } else {
      await client.query('BEGIN READ ONLY');
    }

    const grouped = await client.query<{ username: string }>(
      `SELECT LOWER(username) AS username
       FROM channels
       WHERE username IS NOT NULL
         AND BTRIM(username) <> ''
         AND COALESCE(collect_status, '') <> 'merged'
       GROUP BY LOWER(username)
       HAVING COUNT(*) >= 2
       ORDER BY username`,
    );

    if (grouped.rows.length === 0) {
      console.log('합칠 username 묶음이 없습니다.');
      await client.query('COMMIT');
      return;
    }

    console.log(
      apply
        ? `중복 합치기 적용 (${grouped.rows.length}묶음)`
        : `중복 합치기 dry-run (${grouped.rows.length}묶음, 쓰지 않음)`,
    );

    for (const { username } of grouped.rows) {
      const rowsRes = await client.query<ChannelRow>(
        `SELECT id, title, username, is_verified, is_promoted, recommend_count,
                created_at, collect_status, status
         FROM channels
         WHERE LOWER(username) = $1
           AND COALESCE(collect_status, '') <> 'merged'`,
        [username],
      );
      const rows = rowsRes.rows;
      if (rows.length < 2) continue;

      const ids = rows.map((r) => r.id);
      const extra = await loadCounts(client, ids);
      const keepId = pickKeepChannel(
        rows.map((r) => toCandidate(r, extra.get(r.id)!)),
      ).id;
      const keep = rows.find((r) => r.id === keepId)!;
      const fromRows = rows.filter((r) => r.id !== keepId);
      const fromIds = fromRows.map((r) => r.id);

      const counts: MoveCounts = {};
      for (const spec of MOVE_SPECS) {
        counts[spec.table] = await countMove(client, spec, keep.id, fromIds);
      }
      printGroup(username, keep, fromRows, counts);

      if (apply) {
        await applyGroup(client, keep.id, fromIds);
      }
    }

    if (apply) {
      await client.query('COMMIT');
      console.log('\n적용 완료.');
    } else {
      await client.query('ROLLBACK');
      console.log('\ndry-run 끝. DB에 쓰지 않았습니다.');
    }
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(redact(message));
  process.exitCode = 1;
});
