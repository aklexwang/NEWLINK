/**
 * 운영 후보에 자동 노출 조건을 적용했을 때 몇 개가 등록될지 미리보기.
 * DB 쓰기는 하지 않습니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';
import {
  canAutoExpose,
  PENDING_CATEGORY,
  resolveCategoryWithConfidence,
} from '../src/channels/auto-expose.logic';
import { detectChannelLanguage } from '../src/channels/channel-language.logic';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../src/channels/telegram-username';
import { CategoryAiService } from '../src/auto-manage/category-ai.service';
import { DEFAULT_CATEGORIES } from '../src/categories/default-categories';
import { ConfigService } from '@nestjs/config';
import {
  classifyTelegramAccountHtml,
  parseCount,
  parseInviteLinkHtml,
  TELEGRAM_FETCH_HEADERS,
} from '../src/stats/telegram-preview-html';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const MIGRATE_ENV = path.join(BACKEND_ROOT, '.env.migrate');
const LOCAL_ENV = path.join(BACKEND_ROOT, '.env');
const DELAY_MS = 1_500;
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

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      headers: TELEGRAM_FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return { html: await res.text(), finalUrl: res.url };
  } catch {
    return null;
  }
}

async function run(): Promise<void> {
  loadEnvFile(LOCAL_ENV);
  loadEnvFile(MIGRATE_ENV);
  const url = (process.env.TARGET_DATABASE_URL ?? '').trim();
  if (!url) {
    throw new Error('TARGET_DATABASE_URL 이 없습니다.');
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  let candidates: {
    title: string;
    link: string;
    source: string;
    category: string;
    members: number;
  }[] = [];
  const activeUsernames = new Set<string>();
  try {
    await client.query('BEGIN READ ONLY');
    const rows = await client.query<{
      title: string;
      link: string;
      source: string;
      category: string;
      members: number | null;
    }>(
      `SELECT title, link, source, category, participants_count AS members
       FROM channel_import_candidates
       WHERE status IN ('pending', 'skipped')
       ORDER BY source, title`,
    );
    candidates = rows.rows.map((row) => ({
      title: row.title,
      link: row.link,
      source: row.source,
      category: row.category,
      members: row.members ?? 0,
    }));
    const users = await client.query<{ username: string | null; link: string }>(
      `SELECT username, link FROM channels WHERE status = 'active'`,
    );
    for (const row of users.rows) {
      const fromCol = row.username?.replace(/^@/, '').trim().toLowerCase();
      if (fromCol) activeUsernames.add(fromCol);
      const fromLink = extractTelegramUsernameFromLink(row.link);
      if (fromLink) activeUsernames.add(fromLink);
    }
    await client.query('COMMIT');
  } finally {
    await client.end();
  }

  const bySource: Record<string, number> = {};
  for (const item of candidates) {
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }
  console.log(
    `후보 ${candidates.length}개 (소스별 ${JSON.stringify(bySource)}) 자동 노출 미리보기. DB 쓰기 없음`,
  );

  const ai = new CategoryAiService(new ConfigService(process.env));
  const allowed = ai.defaultCategoryNames().filter((name) => name !== PENDING_CATEGORY);

  let wouldRegister = 0;
  let pendingCat = 0;
  const byCategory: Record<string, number> = {};
  const failReasons: Record<string, number> = {};

  for (let i = 0; i < candidates.length; i += 1) {
    const item = candidates[i];
    const username = extractTelegramUsernameFromLink(item.link);
    let kind: 'channel' | 'group' | 'invalid' | 'unknown' = 'unknown';
    let memberCount: number | null = item.members > 0 ? item.members : null;
    let title = item.title;
    let description = '';

    const page = await fetchPage(item.link);
    if (page) {
      if (isInviteOnlyLink(item.link)) {
        const parsed = parseInviteLinkHtml(page.html, page.finalUrl);
        kind = parsed.expired ? 'invalid' : 'group';
        if (parsed.title) title = parsed.title;
        if (parsed.description) description = parsed.description;
        if (parsed.memberCount != null) memberCount = parsed.memberCount;
      } else {
        const classified = classifyTelegramAccountHtml(page.html);
        kind = classified.kind;
        if (classified.title) title = classified.title;
        const extraMatch = page.html.match(
          /tgme_page_extra[^>]*>([^<]+)/i,
        );
        const extra = extraMatch?.[1] ?? '';
        const parsedMembers = parseCount(extra);
        if (parsedMembers != null) memberCount = parsedMembers;
      }
    }

    const language = detectChannelLanguage({ title, description });
    const check = canAutoExpose({
      kind,
      language,
      memberCount,
      hasActiveUsername: Boolean(username && activeUsernames.has(username)),
    });
    if (!check.ok) {
      failReasons[check.reason] = (failReasons[check.reason] ?? 0) + 1;
    } else {
      wouldRegister += 1;
      const classified = await ai.classify({
        title,
        description,
        allowedCategories: allowed,
      });
      const resolved = resolveCategoryWithConfidence(
        classified.category,
        classified.confidence,
      );
      byCategory[resolved.category] = (byCategory[resolved.category] ?? 0) + 1;
      if (resolved.pending) pendingCat += 1;
    }
    if ((i + 1) % 20 === 0 || i === candidates.length - 1) {
      console.log(
        `진행 ${i + 1}/${candidates.length} 통과 ${wouldRegister} 분류대기 ${pendingCat}`,
      );
    }
    if (i < candidates.length - 1) await sleep(DELAY_MS);
  }

  console.log(`자동 등록 예상 ${wouldRegister}개 / 후보 ${candidates.length}개`);
  console.log(`분류대기 ${pendingCat}개`);
  console.log('카테고리별');
  for (const [name, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`- ${name}: ${count}`);
  }
  console.log('통과 못 한 이유');
  for (const [name, count] of Object.entries(failReasons).sort((a, b) => b[1] - a[1])) {
    console.log(`- ${name}: ${count}`);
  }
}

run().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
