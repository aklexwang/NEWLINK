/**
 * 채널 언어 판별. 기본은 dry-run (쓰지 않음).
 *
 *   npm run classify:language -- --dry-run
 *
 * TARGET_DATABASE_URL 은 backend/.env.migrate 에서만 읽는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';
import {
  detectChannelLanguageResult,
  foreignReasonLabel,
  LANGUAGE_POST_LIMIT,
  type ChannelLanguage,
} from '../src/channels/channel-language.logic';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const MIGRATE_ENV = path.join(BACKEND_ROOT, '.env.migrate');

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

async function run(): Promise<void> {
  loadEnvFile(MIGRATE_ENV);
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
    await client.query('BEGIN READ ONLY');
    const channels = await client.query<{
      id: string;
      title: string;
      description: string | null;
      username: string | null;
    }>(
      `SELECT id, title, description, username
       FROM channels
       WHERE status = 'active'
         AND COALESCE(collect_status, '') <> 'merged'
       ORDER BY title`,
    );

    const excerptCol = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'channel_posts' AND column_name = 'text_excerpt'
       ) AS exists`,
    );
    const hasExcerpt = Boolean(excerptCol.rows[0]?.exists);
    const excerptsByChannel = new Map<string, string[]>();
    if (hasExcerpt) {
      const excerpts = await client.query<{
        channel_id: string;
        text_excerpt: string | null;
      }>(
        `SELECT channel_id::text AS channel_id, text_excerpt
         FROM (
           SELECT channel_id, text_excerpt,
                  ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY posted_at DESC) AS rn
           FROM channel_posts
           WHERE text_excerpt IS NOT NULL AND BTRIM(text_excerpt) <> ''
         ) t
         WHERE rn <= $1`,
        [LANGUAGE_POST_LIMIT],
      );
      for (const row of excerpts.rows) {
        const list = excerptsByChannel.get(row.channel_id) ?? [];
        if (row.text_excerpt) list.push(row.text_excerpt);
        excerptsByChannel.set(row.channel_id, list);
      }
    }

    const counts: Record<ChannelLanguage, number> = {
      ko: 0,
      foreign: 0,
      unknown: 0,
    };
    const foreign: Array<{
      title: string;
      username: string;
      reason: string;
    }> = [];

    for (const ch of channels.rows) {
      const result = detectChannelLanguageResult({
        title: ch.title,
        description: ch.description,
        excerpts: excerptsByChannel.get(ch.id) ?? [],
      });
      counts[result.language] += 1;
      if (result.language === 'foreign') {
        foreign.push({
          title: ch.title,
          username: ch.username ? `@${ch.username}` : '(없음)',
          reason: foreignReasonLabel(result.reason),
        });
      }
    }

    await client.query('ROLLBACK');

    console.log(
      hasExcerpt
        ? '게시글 앞부분(text_excerpt)을 포함해 판별했습니다.'
        : '게시글 본문 컬럼이 없어 제목·설명만으로 판별했습니다.',
    );
    console.log('대상: status=active, collect_status≠merged');
    console.log(`전체 ${channels.rows.length}`);
    console.log(`ko\t${counts.ko}`);
    console.log(`foreign\t${counts.foreign}`);
    console.log(`unknown\t${counts.unknown}`);
    console.log('\n외국어 목록');
    console.log('title\tusername\treason');
    for (const row of foreign) {
      console.log(`${row.title}\t${row.username}\t${row.reason}`);
    }
    console.log('\ndry-run 끝. DB에 쓰지 않았습니다.');
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
