/**
 * 출시 전 한국 채널을 공개 페이지로 대량 확보.
 *
 *   npm run bulk:candidates -- verify --file usernames.txt
 *   npm run bulk:candidates -- expand --dry-run
 *   npm run bulk:candidates -- auto --max-hours 8 --limit 200
 *
 * TARGET_DATABASE_URL 은 backend/.env.migrate 에서만 읽습니다.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { ConfigService } from '@nestjs/config';
import { CategoryAiService } from '../src/auto-manage/category-ai.service';
import {
  canAutoExpose,
  PENDING_CATEGORY,
  resolveCategoryWithConfidence,
} from '../src/channels/auto-expose.logic';
import { resolveCollectTier } from '../src/stats/collect-tier.logic';
import { usernamesFromPost } from '../src/stats/channel-discovery.logic';
import {
  excerptsFromPreviewPosts,
  isBulkProgressTick,
  parseBulkCandidatesArgs,
  parseUsernameListText,
  publicInspectDecision,
  PUBLIC_EXPAND_MAX_PAGES,
  shouldStopBulkAuto,
} from '../src/stats/public-channel-inspect.logic';
import { createPublicTelegramFetcher } from '../src/stats/public-telegram-fetch.logic';
import {
  joinMentionedUsernames,
  parsePublicUsernamePage,
  parseTelegramChannelHtml,
} from '../src/stats/telegram-preview-html';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const MIGRATE_ENV = path.join(BACKEND_ROOT, '.env.migrate');
const LOCAL_ENV = path.join(BACKEND_ROOT, '.env');
const PROGRESS_PATH = path.join(
  BACKEND_ROOT,
  'data',
  'bulk-candidates-progress.json',
);

type Progress = {
  verified: string[];
  expanded: string[];
  round: number;
  failReasons: Record<string, number>;
  checked: number;
  passed: number;
};

function loadEnvFile(filePath: string, override = false): void {
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
    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function redact(message: string): string {
  return message.replace(/postgresql:\/\/\S+/gi, '[redacted]');
}

function loadProgress(): Progress {
  if (!fs.existsSync(PROGRESS_PATH)) {
    return {
      verified: [],
      expanded: [],
      round: 0,
      failReasons: {},
      checked: 0,
      passed: 0,
    };
  }
  const raw = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')) as Partial<Progress>;
  return {
    verified: raw.verified ?? [],
    expanded: raw.expanded ?? [],
    round: raw.round ?? 0,
    failReasons: raw.failReasons ?? {},
    checked: raw.checked ?? 0,
    passed: raw.passed ?? 0,
  };
}

function saveProgress(progress: Progress) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8');
}

async function countPublicChannels(client: Client): Promise<number> {
  const row = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM channels
     WHERE status = 'active' AND COALESCE(is_visible, true) = true`,
  );
  return Number(row.rows[0]?.n ?? 0);
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function main() {
  loadEnvFile(LOCAL_ENV, false);
  loadEnvFile(MIGRATE_ENV, true);
  const args = parseBulkCandidatesArgs(process.argv.slice(2));
  const url = (process.env.TARGET_DATABASE_URL ?? '').trim();
  if (!url) throw new Error('TARGET_DATABASE_URL 이 없습니다.');

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  const fetcher = createPublicTelegramFetcher();
  const ai = new CategoryAiService(new ConfigService(process.env));
  const allowed = ai.defaultCategoryNames();
  const progress = loadProgress();
  const verifiedSet = new Set(progress.verified);
  const startedAtMs = Date.now();

  const logTick = async (label: string) => {
    const total = await countPublicChannels(client);
    console.log(
      `${label} 확인 ${progress.checked} / 통과 ${progress.passed} / 공개 채널 ${total} / 탈락 ${JSON.stringify(progress.failReasons)}`,
    );
  };

  try {
    if (args.mode === 'expand') {
      await runExpand(client, fetcher, progress, args.limit, args.dryRun);
      saveProgress(progress);
      await logTick('expand');
      return;
    }
    if (args.mode === 'verify') {
      await runVerify(client, fetcher, ai, allowed, progress, verifiedSet, args);
      saveProgress(progress);
      await logTick('verify');
      return;
    }

    let stop = false;
    while (!stop) {
      progress.round += 1;
      progress.expanded = [];
      const queued = await runExpand(
        client,
        fetcher,
        progress,
        args.limit,
        args.dryRun,
      );
      saveProgress(progress);
      await runVerify(client, fetcher, ai, allowed, progress, verifiedSet, args);
      saveProgress(progress);
      await logTick(`auto ${progress.round}바퀴`);
      stop = shouldStopBulkAuto({
        newCandidatesThisRound: queued,
        startedAtMs,
        maxHours: args.maxHours,
      });
    }
  } finally {
    await client.end();
  }
}

async function knownUsernames(client: Client): Promise<Set<string>> {
  const known = new Set<string>();
  const channels = await client.query<{ username: string | null; link: string }>(
    `SELECT username, link FROM channels WHERE status = 'active'`,
  );
  for (const row of channels.rows) {
    const fromCol = row.username?.replace(/^@/, '').trim().toLowerCase();
    if (fromCol) known.add(fromCol);
    const fromLink = row.link.match(/t\.me\/([a-zA-Z0-9_]{4,})/i)?.[1];
    if (fromLink && fromLink !== 's' && fromLink !== 'joinchat') {
      known.add(fromLink.toLowerCase());
    }
  }
  const discovered = await client.query<{ username: string }>(
    `SELECT username FROM discovered_usernames`,
  );
  for (const row of discovered.rows) known.add(row.username.toLowerCase());
  return known;
}

async function runExpand(
  client: Client,
  fetcher: ReturnType<typeof createPublicTelegramFetcher>,
  progress: Progress,
  limit: number | null,
  dryRun: boolean,
): Promise<number> {
  const expandedSet = new Set(progress.expanded);
  const known = await knownUsernames(client);
  const sources = await client.query<{
    id: string;
    username: string | null;
    link: string;
  }>(
    `SELECT id, username, link FROM channels
     WHERE status = 'active'
       AND link_type = 'channel'
       AND COALESCE(is_visible, true) = true
     ORDER BY id`,
  );
  let queued = 0;
  let visited = 0;
  for (const row of sources.rows) {
    if (limit != null && visited >= limit) break;
    if (expandedSet.has(row.id)) continue;
    const username = (
      row.username ||
      row.link.match(/t\.me\/([a-zA-Z0-9_]{4,})/i)?.[1] ||
      ''
    )
      .replace(/^@/, '')
      .toLowerCase();
    if (!username) {
      expandedSet.add(row.id);
      continue;
    }
    visited += 1;
    const found = await collectFeedUsernames(fetcher, username);
    for (const name of found) {
      if (known.has(name)) continue;
      known.add(name);
      queued += 1;
      if (!dryRun) {
        await client.query(
          `INSERT INTO discovered_usernames (username, result, checked_at, mention_count)
           VALUES ($1, 'queued', NOW(), 0)
           ON CONFLICT (username) DO NOTHING`,
          [name],
        );
      }
    }
    expandedSet.add(row.id);
    progress.expanded = [...expandedSet];
    saveProgress(progress);
  }
  console.log(`expand: 소스 ${visited} / 새 후보 ${queued}${dryRun ? ' (dry-run)' : ''}`);
  return queued;
}

async function collectFeedUsernames(
  fetcher: ReturnType<typeof createPublicTelegramFetcher>,
  username: string,
): Promise<string[]> {
  const names = new Set<string>();
  let before: number | undefined;
  for (let page = 0; page <= PUBLIC_EXPAND_MAX_PAGES; page += 1) {
    const url =
      before != null
        ? `https://t.me/s/${username}?before=${before}`
        : `https://t.me/s/${username}`;
    const res = await fetcher.fetchHtml(url);
    if (!res.html || res.status >= 400) break;
    const parsed = parseTelegramChannelHtml(res.html);
    if (parsed.posts.length === 0) break;
    let minId: number | null = null;
    for (const post of parsed.posts) {
      minId = minId == null ? post.messageId : Math.min(minId, post.messageId);
      for (const name of usernamesFromPost({
        sourceChannelId: username,
        sourceUsername: username,
        forwardedFrom: post.forwardedFrom,
        mentionedUsernames: joinMentionedUsernames(post.mentionedUsernames),
      })) {
        names.add(name);
      }
    }
    if (minId == null || minId === before) break;
    before = minId;
  }
  return [...names];
}

async function runVerify(
  client: Client,
  fetcher: ReturnType<typeof createPublicTelegramFetcher>,
  ai: CategoryAiService,
  allowed: string[],
  progress: Progress,
  verifiedSet: Set<string>,
  args: ReturnType<typeof parseBulkCandidatesArgs>,
) {
  const fromFile = args.file
    ? parseUsernameListText(fs.readFileSync(path.resolve(args.file), 'utf8'))
    : [];
  if (!args.dryRun) {
    for (const name of fromFile) {
      await client.query(
        `INSERT INTO discovered_usernames (username, result, checked_at, mention_count)
         VALUES ($1, 'queued', NOW(), 0)
         ON CONFLICT (username) DO NOTHING`,
        [name],
      );
    }
  }
  const queued = await client.query<{ username: string }>(
    `SELECT username FROM discovered_usernames
     WHERE result = 'queued'
     ORDER BY username`,
  );
  const names = [
    ...fromFile,
    ...queued.rows.map((row) => row.username.toLowerCase()),
  ].filter((name, index, all) => all.indexOf(name) === index);

  let checkedThis = 0;
  for (const username of names) {
    if (args.limit != null && checkedThis >= args.limit) break;
    if (verifiedSet.has(username)) continue;
    checkedThis += 1;
    progress.checked += 1;
    const outcome = await inspectAndMaybeRegister(
      client,
      fetcher,
      ai,
      allowed,
      username,
      args.dryRun,
    );
    verifiedSet.add(username);
    progress.verified = [...verifiedSet];
    if (outcome === 'ok') progress.passed += 1;
    else bump(progress.failReasons, outcome);
    if (isBulkProgressTick(progress.checked)) {
      const total = await countPublicChannels(client);
      console.log(
        `확인 ${progress.checked} / 통과 ${progress.passed} / 공개 채널 ${total} / 탈락 ${JSON.stringify(progress.failReasons)}`,
      );
    }
    saveProgress(progress);
  }
}

async function inspectAndMaybeRegister(
  client: Client,
  fetcher: ReturnType<typeof createPublicTelegramFetcher>,
  ai: CategoryAiService,
  allowed: string[],
  username: string,
  dryRun: boolean,
): Promise<string> {
  const page = await fetcher.fetchHtml(`https://t.me/${username}`);
  if (!page.html || page.status >= 400) {
    await markDiscovered(client, username, 'not_found', dryRun);
    return 'not_found';
  }
  const parsed = parsePublicUsernamePage(page.html);
  let excerpts: string[] = [];
  if (parsed.kind === 'channel') {
    const feed = await fetcher.fetchHtml(`https://t.me/s/${username}`);
    if (feed.html) {
      excerpts = excerptsFromPreviewPosts(
        parseTelegramChannelHtml(feed.html).posts,
      );
    }
  }
  const decision = publicInspectDecision({
    kind: parsed.kind,
    title: parsed.title,
    description: parsed.description,
    memberCount: parsed.memberCount,
    avatarUrl: parsed.avatarUrl,
    excerpts,
  });
  if (decision.result !== 'ok') {
    await markDiscovered(client, username, decision.result, dryRun);
    return decision.result;
  }

  const dup = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM channels
     WHERE status = 'active' AND LOWER(COALESCE(username, '')) = $1`,
    [username],
  );
  const check = canAutoExpose({
    kind: decision.kind,
    language: decision.language,
    memberCount: parsed.memberCount,
    hasActiveUsername: Number(dup.rows[0]?.n ?? 0) > 0,
  });
  if (!check.ok) {
    const mapped =
      check.reason === 'duplicate_username'
        ? 'not_found'
        : check.reason === 'members'
          ? 'too_small'
          : check.reason === 'language'
            ? 'not_korean'
            : 'not_found';
    await markDiscovered(client, username, mapped, dryRun);
    return check.reason;
  }

  if (dryRun) return 'ok';

  const classified = await ai.classify({
    title: parsed.title ?? username,
    description: parsed.description ?? undefined,
    posts: excerpts,
    allowedCategories: allowed,
  });
  const resolved = resolveCategoryWithConfidence(
    classified.category,
    classified.confidence,
  );
  const id = randomUUID();
  const now = new Date();
  const collectTier = resolveCollectTier({
    memberCount: parsed.memberCount,
    posts7d: 0,
  });
  await client.query(
    `INSERT INTO channels (
       id, title, link, link_type, category, description,
       recommend_count, status, is_promoted, promotion_sort_order,
       avatar_approved, language, language_locked, is_visible,
       category_locked, auto_registered, collect_fail_count, is_verified,
       member_count, username, collect_tier, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       0, 'active', false, 0,
       false, $7, false, true,
       false, true, 0, false,
       $8, $9, $10, $11, $11
     )`,
    [
      id,
      (parsed.title ?? username).slice(0, 255),
      `https://t.me/${username}`,
      decision.linkType,
      resolved.pending ? PENDING_CATEGORY : resolved.category,
      (parsed.description || parsed.title || username).slice(0, 2000),
      decision.language,
      parsed.memberCount,
      username,
      collectTier,
      now,
    ],
  );
  await markDiscovered(client, username, 'added', false);
  return 'ok';
}

async function markDiscovered(
  client: Client,
  username: string,
  result: string,
  dryRun: boolean,
) {
  if (dryRun) return;
  await client.query(
    `INSERT INTO discovered_usernames (username, result, checked_at, mention_count)
     VALUES ($1, $2, NOW(), 0)
     ON CONFLICT (username) DO UPDATE
       SET result = EXCLUDED.result, checked_at = EXCLUDED.checked_at`,
    [username, result],
  );
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
