import { LinkType } from '../channels/channel.entity';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';

export type StatsCollectMode = 'full' | 'light';

export const FULL_PIPELINE_STEPS = [
  'collect',
  'language',
  'metrics',
  'prune',
  'verify',
  'discovery',
  'keyword',
] as const;

export const LIGHT_PIPELINE_STEPS = [
  'previewCollect',
  'clearPublicCache',
] as const;

/** full 이 앞선 light 를 기다리는 최대 시간. light 예산(25분)+여유.
 * 11/9: 10분만 기다리다 light 가 55초 뒤 끝났는데 full 을 통째로 건너뜀 → 30분으로 */
export const FULL_WAIT_FOR_LIGHT_MS = 30 * 60 * 1000;

/** UTC cron. KST 03:05 */
export const STATS_CRON_FULL_UTC = '5 18 * * *';

/** UTC cron. KST 06:05, 09:05, 12:05, 15:05, 18:05, 21:05, 00:05 */
export const STATS_CRON_LIGHT_UTC = [
  '5 21 * * *',
  '5 0 * * *',
  '5 3 * * *',
  '5 6 * * *',
  '5 9 * * *',
  '5 12 * * *',
  '5 15 * * *',
] as const;

export function parseStatsCollectMode(raw?: string | null): StatsCollectMode {
  return (raw ?? '').trim().toLowerCase() === 'light' ? 'light' : 'full';
}

export function statsCronModeFromSchedule(input: {
  eventName?: string | null;
  schedule?: string | null;
  dispatchMode?: string | null;
}): StatsCollectMode {
  if (input.eventName === 'workflow_dispatch') {
    return parseStatsCollectMode(input.dispatchMode || 'light');
  }
  if ((input.schedule ?? '').trim() === STATS_CRON_FULL_UTC) return 'full';
  return 'light';
}

export function statsCronWaitMinutes(mode: StatsCollectMode): number {
  return mode === 'light' ? 35 : 110;
}

export type CollectOverlapDecision =
  | { action: 'start' }
  | { action: 'skip_conflict' }
  | { action: 'skip_busy' }
  | { action: 'wait_for_light' };

export function decideCollectOverlap(input: {
  requested: StatsCollectMode;
  running: StatsCollectMode | null;
}): CollectOverlapDecision {
  if (input.running == null) return { action: 'start' };
  if (input.requested === 'light') return { action: 'skip_conflict' };
  if (input.running === 'light') return { action: 'wait_for_light' };
  return { action: 'skip_busy' };
}

/** light 대상: 공개 username 이 있는 채널. 그룹·초대방 제외 */
export function isLightCollectTarget(channel: {
  linkType?: string | null;
  username?: string | null;
  link?: string | null;
}): boolean {
  if (channel.linkType !== LinkType.CHANNEL && channel.linkType !== 'channel') {
    return false;
  }
  if (isInviteOnlyLink(channel.link)) return false;
  const fromCol = channel.username?.replace(/^@/, '').trim();
  if (fromCol) return true;
  return extractTelegramUsernameFromLink(channel.link) != null;
}

/**
 * light(t.me/s 미리보기만 보는 수집)에서 글이 하나도 안 보일 때 "수집 실패"로 기록할지.
 * 미리보기가 막힌 채널은 full 수집(봇·MTProto)이 따로 처리하므로, 이미 수집된 적 있는
 * 채널의 상태를 light 가 failed 로 덮어쓰지 않는다. 한 번도 수집 못 한 채널만 이유를 남긴다.
 */
export function shouldMarkLightNoPostsFailed(channel: {
  firstObservedAt?: Date | string | null;
}): boolean {
  return channel.firstObservedAt == null || channel.firstObservedAt === '';
}

/** 피드「마지막 게시」= 수집된 글 postedAt 최댓값. light 미리보기가 이 값을 3시간 안에 갱신한다 */
export function lastPostAtFromCollectedPosts(
  posts: Array<{ postedAt: Date | string }>,
): Date | null {
  let latest: Date | null = null;
  for (const post of posts) {
    const at =
      post.postedAt instanceof Date ? post.postedAt : new Date(post.postedAt);
    if (Number.isNaN(at.getTime())) continue;
    if (!latest || at.getTime() > latest.getTime()) latest = at;
  }
  return latest;
}

/** 서버 안 일정(KST). full 은 새벽 3시 handleNightlyCron 이 따로 돈다 */
export const SERVER_LIGHT_CRON_KST = '5 0,6,9,12,15,18,21 * * *';

/** 같은 모드가 이 시간 안에 이미 시작됐으면 GitHub 예비 실행 등 두 번째 요청은 건너뛴다 */
export const RECENT_RUN_WINDOW_MS: Record<StatsCollectMode, number> = {
  light: 60 * 60 * 1000,
  // GitHub 예비 full 이 몇 시간 늦게 와도 같은 날 두 번 돌지 않게 (11/9 6→20시간)
  full: 20 * 60 * 60 * 1000,
};

export function startedRecently(input: {
  mode: StatsCollectMode;
  lastStartedAtMs: number | null | undefined;
  nowMs: number;
}): boolean {
  if (input.lastStartedAtMs == null) return false;
  const elapsed = input.nowMs - input.lastStartedAtMs;
  return elapsed >= 0 && elapsed < RECENT_RUN_WINDOW_MS[input.mode];
}

/**
 * 웹 미리보기(t.me/s)가 막혀 글을 못 읽는 공개 채널 표시.
 * 상태(collectStatus)는 그대로 두고 collectError 칸에만 남긴다.
 */
export const PREVIEW_BLOCKED_ERRORS = [
  'preview:disabled',
  'preview:no_posts',
] as const;
export const PREVIEW_DISABLED_ERROR = 'preview:disabled';
/** 한 번 빈 미리보기였음 (아직 막힘 아님. 텔레그램이 느릴 때 빈 페이지가 오는 일이 있어 한 번 더 본다) */
export const PREVIEW_EMPTY_ONCE = 'preview:empty_once';

/**
 * 미리보기가 비었을 때 남길 표시: 두 번 연속(또는 이미 막힘)일 때만 막힘으로.
 * 11/4 텔레그램이 느려진 날 하루 만에 막힘이 33→240 으로 잘못 늘었던 일 때문
 */
export function previewMissError(
  previousError: string | null | undefined,
): string {
  const prev = (previousError ?? '').trim();
  if (prev === PREVIEW_EMPTY_ONCE) return PREVIEW_DISABLED_ERROR;
  if ((PREVIEW_BLOCKED_ERRORS as readonly string[]).includes(prev)) return prev;
  return PREVIEW_EMPTY_ONCE;
}

export function isPreviewBlocked(channel: {
  collectError?: string | null;
}): boolean {
  return (PREVIEW_BLOCKED_ERRORS as readonly string[]).includes(
    (channel.collectError ?? '').trim(),
  );
}

/**
 * 새벽 full 에서 MTProto 를 쓸지. 아이디 조회(resolve, 하루 한도 50~)는 귀해서
 * 접근 정보가 아직 없는 "채널"은 미리보기가 막힌 경우에만 조회한다(미리보기로 읽히는 채널은 미리보기로).
 * 그룹·이미 접근 정보가 있는 방은 예전처럼 MTProto.
 */
/** 하루 아이디 조회 중 "미리보기 막힌 채널" 몫으로 남겨 두는 수 (환경 변수 MTPROTO_RESOLVE_BLOCKED_RESERVE) */
export const RESOLVE_BLOCKED_RESERVE_DEFAULT = 25;

export function resolveBlockedReserve(raw?: string | null): number {
  if (raw == null || String(raw).trim() === '') {
    return RESOLVE_BLOCKED_RESERVE_DEFAULT;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0
    ? Math.floor(n)
    : RESOLVE_BLOCKED_RESERVE_DEFAULT;
}

export function shouldUseMtprotoForFull(channel: {
  linkType?: string | null;
  collectError?: string | null;
  hasStoredAccess: boolean;
  /** 오늘 남은 아이디 조회 수 (모르면 제한 없음) */
  resolvesLeft?: number;
  /** 미리보기 막힌 채널 몫으로 남길 조회 수 */
  blockedReserve?: number;
}): boolean {
  if (channel.hasStoredAccess) return true;
  if (isPreviewBlocked(channel)) return true;
  // 미리보기로 읽히는 채널은 조회를 쓰지 않는다
  if (channel.linkType === 'channel') return false;
  // 그룹 등은 조회를 쓰되, 막힌 채널 몫은 남겨 둔다 (00:05 light 의 새 그룹 첫 수집이 하루 몫을 다 쓰던 문제)
  const left = channel.resolvesLeft ?? Number.POSITIVE_INFINITY;
  return left > (channel.blockedReserve ?? 0);
}
