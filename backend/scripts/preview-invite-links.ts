/**
 * 운영 DB 초대방 링크를 공개 미리보기만 확인합니다. 쓰기는 하지 않습니다.
 *
 * TARGET_DATABASE_URL 은 backend/.env.migrate 에서만 읽는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';
import { CHANNEL_GAP_MS } from '../src/stats/collect-fetch';
import {
  parseInviteLinkHtml,
  TELEGRAM_FETCH_HEADERS,
} from '../src/stats/telegram-preview-html';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const MIGRATE_ENV = path.join(BACKEND_ROOT, '.env.migrate');
const FETCH_TIMEOUT_MS = 12_000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let rooms: { title: string; link: string }[] = [];
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query<{ title: string; link: string }>(
      `SELECT title, link
       FROM channels
       WHERE status = 'active'
         AND (
           collect_status = 'invite_only'
           OR link ILIKE '%t.me/+%'
           OR link ILIKE '%joinchat%'
         )
       ORDER BY title`,
    );
    rooms = result.rows;
    await client.query('COMMIT');
  } finally {
    await client.end();
  }

  console.log(`초대방 ${rooms.length}개 공개 미리보기 확인 (DB 쓰기 없음)`);

  let valid = 0;
  let expired = 0;
  let failed = 0;
  const lines: string[] = [];

  for (let i = 0; i < rooms.length; i += 1) {
    const room = rooms[i];
    let status = '확인 실패';
    let members: number | null = null;
    let title = room.title;
    try {
      const res = await fetch(room.link, {
        headers: TELEGRAM_FETCH_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const html = await res.text();
      const parsed = parseInviteLinkHtml(html, res.url);
      if (res.status === 404 || parsed.expired) {
        status = '만료';
        expired += 1;
      } else {
        status = '유효';
        valid += 1;
        members = parsed.memberCount;
        if (parsed.title) title = parsed.title;
      }
    } catch {
      failed += 1;
    }
    const memberText = members == null ? '-' : members.toLocaleString('ko-KR');
    lines.push(`${title} · ${status} · 인원 ${memberText}`);
    if (i < rooms.length - 1) await sleep(CHANNEL_GAP_MS);
  }

  console.log(`유효 ${valid} / 만료 ${expired} / 확인 실패 ${failed}`);
  for (const line of lines) console.log(line);
}

run().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
