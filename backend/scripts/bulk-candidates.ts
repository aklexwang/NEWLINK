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
import {
  bulkDeadlineMs,
  excerptsFromPreviewPosts,
  isBulkDeadlinePassed,
  isBulkProgressTick,
  mentionsFromTelegramHtml,
  parseBulkCandidatesArgs,
  parseUsernameListText,
  publicInspectDecision,
  PUBLIC_EXPAND_MAX_PAGES,
  shouldStopBulkAuto,
  toDiscoveryResult,
} from '../src/stats/public-channel-inspect.logic';
import { createPublicTelegramFetcher } from '../src/stats/public-telegram-fetch.logic';
import {
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

type RoundStat = {
  round: number;
  queued: number;
  checked: number;
  passed: number;
};

type Progress = {
  verified: string[];
  expanded: string[];
  round: number;
  phase: 'expand' | 'verify' | 'idle';
  failReasons: Record<string, number>;
  checked: number;
  passed: number;
  rounds: RoundStat[];
  lastQueued: number;
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
      phase: 'idle',
      failReasons: {},
      checked: 0,
      passed: 0,
      rounds: [],
      lastQueued: 0,
    };
  }
  const raw = JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')) as Partial<Progress>;
  return {
    verified: raw.verified ?? [],
    expanded: raw.expanded ?? [],
    round: raw.round ?? 0,
    phase: raw.phase === 'expand' || raw.phase === 'verify' ? raw.phase : 'idle',
    failReasons: raw.failReasons ?? {},
    checked: raw.checked ?? 0,
    passed: raw.passed ?? 0,
    rounds: raw.rounds ?? [],
    lastQueued: raw.lastQueued ?? 0,
  };
}

function saveProgress(progress: Progress) {
  fs.mkdirSync(path.dirname(PROGRESS_PATH), { recursive: true });
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), 'utf8');
}

async function countPublicChannels(client: Client): Promise<number> {
  const row = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM channels
     WHERE status = 'active'
       AND COALESCE(is_visible, true) = true
       AND first_observed_at IS NOT NULL
       AND (collect_status IS NULL OR collect_status NOT IN ('invalid', 'gone', 'merged', 'invite_expired'))
       AND (COALESCE(is_promoted, false) = true OR COALESCE(language, 'unknown') <> 'foreign')`,
  );
  return Number(row.rows[0]?.n ?? 0);
}

async function categoryCounts(client: Client): Promise<{ category: string; n: number }[]> {
  const rows = await client.query<{ category: string; n: string }>(
    `SELECT COALESCE(category, '(없음)') AS category, COUNT(*)::text AS n
     FROM channels
     WHERE status = 'active' AND COALESCE(is_visible, true) = true
     GROUP BY 1
     ORDER BY COUNT(*) DESC, category`,
  );
  return rows.rows.map((row) => ({ category: row.category, n: Number(row.n) }));
}

function failReasonLabel(key: string): string {
  if (key === 'not_korean' || key === 'language') return '한국어 아님';
  if (key === 'too_small' || key === 'members') return '인원 100명 미만';
  if (key === 'not_channel' || key === 'invalid') return '채널 아님';
  if (key === 'gone' || key === 'not_found') return '없어진 아이디';
  return '기타';
}

function summarizeFailReasons(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {
    '한국어 아님': 0,
    '인원 100명 미만': 0,
    '채널 아님': 0,
    '없어진 아이디': 0,
    기타: 0,
  };
  for (const [key, count] of Object.entries(raw)) {
    out[failReasonLabel(key)] += count;
  }
  return out;
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

async function columnExists(
  client: Client,
  table: string,
  column: string,
): Promise<boolean> {
  const row = await client.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return Number(row.rows[0]?.n ?? 0) > 0;
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
  if (args.dryRun) {
    await client.query('BEGIN READ ONLY');
  }
  const fetcher = createPublicTelegramFetcher();
  const ai = new CategoryAiService(new ConfigService(process.env));
  const allowed = ai.defaultCategoryNames();
  if (!ai.isConfigured()) {
    console.log('AI_API_KEY 없음. 카테고리는 키워드 폴백으로 분류합니다.');
  }
  console.log(`진행 파일: data/bulk-candidates-progress.json (중단 후 이어서 가능)`);
  const progress = loadProgress();
  const verifiedSet = new Set(progress.verified);
  const startedAtMs = Date.now();
  const deadlineMs = bulkDeadlineMs(startedAtMs, args.maxHours);
  const hasCollectTier = await columnExists(client, 'channels', 'collect_tier');

  const logTick = async (label: string) => {
    const total = await countPublicChannels(client);
    console.log(
      `${label} 확인 ${progress.checked} / 통과 ${progress.passed} / 공개 채널 ${total} / 탈락 ${JSON.stringify(summarizeFailReasons(progress.failReasons))}`,
    );
  };

  const printSummary = async () => {
    console.log('--- 결과 ---');
    if (progress.rounds.length === 0) {
      console.log('완료된 바퀴 없음');
    }
    for (const round of progress.rounds) {
      console.log(
        `바퀴 ${round.round}: 새 후보 ${round.queued} / 확인 ${round.checked} / 등록 ${round.passed}`,
      );
    }
    console.log('탈락 사유');
    for (const [label, count] of Object.entries(
      summarizeFailReasons(progress.failReasons),
    )) {
      console.log(`- ${label}: ${count}`);
    }
    console.log('등록된 채널 카테고리');
    for (const row of await categoryCounts(client)) {
      console.log(`- ${row.category}: ${row.n}`);
    }
    console.log(`공개 노출 채널 총수: ${await countPublicChannels(client)}`);
  };

  try {
    if (args.mode === 'expand') {
      await runExpand(
        client,
        fetcher,
        progress,
        args.limit,
        args.dryRun,
        deadlineMs,
      );
      if (!args.dryRun) saveProgress(progress);
      if (!args.dryRun) await logTick('expand');
      return;
    }
    if (args.mode === 'verify') {
      await runVerify(
        client,
        fetcher,
        ai,
        allowed,
        progress,
        verifiedSet,
        args,
        deadlineMs,
        hasCollectTier,
      );
      saveProgress(progress);
      await logTick('verify');
      return;
    }

    let stop = false;
    while (!stop) {
      if (isBulkDeadlinePassed(deadlineMs)) {
        console.log('제한 시간에 닿아 중단합니다.');
        break;
      }
      if (progress.phase !== 'expand' && progress.phase !== 'verify') {
        progress.round += 1;
        progress.expanded = [];
        progress.phase = 'expand';
        saveProgress(progress);
      }
      let queued = progress.lastQueued ?? 0;
      const checkedBefore = progress.checked;
      const passedBefore = progress.passed;
      if (progress.phase === 'expand') {
        queued = await runExpand(
          client,
          fetcher,
          progress,
          args.limit,
          args.dryRun,
          deadlineMs,
        );
        progress.lastQueued = queued;
        progress.phase = 'verify';
        saveProgress(progress);
      }
      if (progress.phase === 'verify') {
        await runVerify(
          client,
          fetcher,
          ai,
          allowed,
          progress,
          verifiedSet,
          args,
          deadlineMs,
          hasCollectTier,
        );
        progress.rounds.push({
          round: progress.round,
          queued: progress.lastQueued,
          checked: progress.checked - checkedBefore,
          passed: progress.passed - passedBefore,
        });
        progress.phase = 'idle';
        saveProgress(progress);
        await logTick(`auto ${progress.round}바퀴`);
        stop = shouldStopBulkAuto({
          newCandidatesThisRound: queued,
          startedAtMs,
          maxHours: args.maxHours,
        });
      }
    }
    await printSummary();
  } catch (error) {
    console.error(redact(error instanceof Error ? error.message : String(error)));
    try {
      await printSummary();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    if (args.dryRun) {
      try {
        await client.query('COMMIT');
      } catch {
        /* ignore */
      }
    }
    await client.end();
  }
}

async function registeredUsernames(client: Client): Promise<Set<string>> {
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
  return known;
}

async function knownUsernames(client: Client): Promise<Set<string>> {
  const known = await registeredUsernames(client);
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
  deadlineMs: number | null,
): Promise<number> {
  const expandedSet = dryRun ? new Set<string>() : new Set(progress.expanded);
  const registered = await registeredUsernames(client);
  const known = dryRun ? registered : await knownUsernames(client);
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
  const overlap = new Set<string>();
  const invalidFormat = new Set<string>();
  for (const row of sources.rows) {
    if (isBulkDeadlinePassed(deadlineMs)) break;
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
    for (const path of found.invalidFormat) invalidFormat.add(path);
    for (const name of found.usernames) {
      if (registered.has(name)) {
        overlap.add(name);
        continue;
      }
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
    if (!dryRun) {
      progress.expanded = [...expandedSet];
      saveProgress(progress);
    }
    if (dryRun && visited % 20 === 0) {
      console.log(
        `expand 미리보기 진행: 소스 ${visited}/${sources.rows.length} 새 후보 ${queued} 등록 겹침 ${overlap.size} 형식 오류 ${invalidFormat.size}`,
      );
    }
  }
  console.log(
    `expand: 소스 ${visited} / 새 후보 ${queued} / 등록된 것과 겹침 ${overlap.size} / 아이디 형식 오류 ${invalidFormat.size}${dryRun ? ' (dry-run, 등록 없음)' : ''}`,
  );
  return queued;
}

async function collectFeedUsernames(
  fetcher: ReturnType<typeof createPublicTelegramFetcher>,
  username: string,
): Promise<{ usernames: string[]; invalidFormat: string[] }> {
  const names = new Set<string>();
  const invalidFormat = new Set<string>();
  let before: number | undefined;
  for (let page = 0; page <= PUBLIC_EXPAND_MAX_PAGES; page += 1) {
    const url =
      before != null
        ? `https://t.me/s/${username}?before=${before}`
        : `https://t.me/s/${username}`;
    const res = await fetcher.fetchHtml(url);
    if (!res.html || res.status >= 400) break;
    const mentions = mentionsFromTelegramHtml(res.html, username);
    for (const name of mentions.usernames) names.add(name);
    for (const path of mentions.invalidFormat) invalidFormat.add(path);
    const parsed = parseTelegramChannelHtml(res.html);
    if (parsed.posts.length === 0) break;
    let minId: number | null = null;
    for (const post of parsed.posts) {
      minId = minId == null ? post.messageId : Math.min(minId, post.messageId);
    }
    if (minId == null || minId === before) break;
    before = minId;
  }
  return { usernames: [...names], invalidFormat: [...invalidFormat] };
}

async function runVerify(
  client: Client,
  fetcher: ReturnType<typeof createPublicTelegramFetcher>,
  ai: CategoryAiService,
  allowed: string[],
  progress: Progress,
  verifiedSet: Set<string>,
  args: ReturnType<typeof parseBulkCandidatesArgs>,
  deadlineMs: number | null,
  hasCollectTier: boolean,
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
    if (isBulkDeadlinePassed(deadlineMs)) break;
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
      hasCollectTier,
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
  hasCollectTier: boolean,
): Promise<string> {
  const page = await fetcher.fetchHtml(`https://t.me/${username}`);
  if (!page.html || page.status >= 400) {
    await markDiscovered(client, username, 'gone', dryRun);
    return 'gone';
  }
  const parsed = parsePublicUsernamePage(page.html);
  if (parsed.reason === 'page:not_found') {
    await markDiscovered(client, username, 'gone', dryRun);
    return 'gone';
  }
  if (parsed.kind !== 'channel' && parsed.kind !== 'group') {
    await markDiscovered(client, username, 'not_channel', dryRun);
    return 'not_channel';
  }
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
  // PC 대량 도구는 사람이 확인하지 않으므로 언어 미확인도 한국어 아님으로 둔다
  const decided = toDiscoveryResult(decision.result);
  if (decided !== 'ok') {
    await markDiscovered(client, username, decided, dryRun);
    return decided;
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
    return mapped === 'not_found' ? 'duplicate' : mapped;
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
  const columns = [
    'id',
    'title',
    'link',
    'link_type',
    'category',
    'description',
    'recommend_count',
    'status',
    'is_promoted',
    'promotion_sort_order',
    'avatar_approved',
    'language',
    'language_locked',
    'is_visible',
    'category_locked',
    'auto_registered',
    'collect_fail_count',
    'is_verified',
    'member_count',
    'username',
    'first_observed_at',
    'created_at',
    'updated_at',
  ];
  const values: unknown[] = [
    id,
    (parsed.title ?? username).slice(0, 255),
    `https://t.me/${username}`,
    decision.linkType,
    resolved.pending ? PENDING_CATEGORY : resolved.category,
    (parsed.description || parsed.title || username).slice(0, 2000),
    0,
    'active',
    false,
    0,
    false,
    decision.language,
    false,
    true,
    false,
    true,
    0,
    false,
    parsed.memberCount,
    username,
    now,
    now,
    now,
  ];
  if (hasCollectTier) {
    columns.splice(columns.indexOf('first_observed_at'), 0, 'collect_tier');
    values.splice(values.indexOf(now), 0, collectTier);
  }
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO channels (${columns.join(', ')}) VALUES (${placeholders})`,
    values,
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
