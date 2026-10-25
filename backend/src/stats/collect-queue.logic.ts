import {
  CLASSIFY_TTL_MS,
  INVITE_EXPIRED_RECHECK_MS,
  shouldSkipInviteExpiredRecheck,
} from './collect-fetch';

/**
 * 우선순위 수집 큐의 순수 규칙.
 * 채널마다 "목표 간격"(구간)을 정하고, 수집이 끝날 때마다 next_collect_at 을 그만큼 뒤로 민다.
 * 요일 버킷(daily/weekly)은 이 큐로 대체되었다.
 */
export type CollectBand = 'hot' | 'normal' | 'quiet' | 'dormant';

export const COLLECT_BANDS: readonly CollectBand[] = [
  'hot',
  'normal',
  'quiet',
  'dormant',
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 구간별 목표 수집 간격 */
export const COLLECT_BAND_INTERVAL_MS: Record<CollectBand, number> = {
  hot: 12 * HOUR_MS,
  normal: 24 * HOUR_MS,
  quiet: 48 * HOUR_MS,
  dormant: 72 * HOUR_MS,
};

export const COLLECT_BAND_LABEL: Record<CollectBand, string> = {
  hot: '핫',
  normal: '보통',
  quiet: '조용',
  dormant: '휴면',
};

/** 핫: 새 채널(등록 후 7일) · 회원 1만 이상 · 7일 게시 28 이상 */
export const HOT_NEW_CHANNEL_DAYS = 7;
export const HOT_MEMBER_MIN = 10_000;
export const HOT_POSTS_7D_MIN = 28;
/** 보통: 7일 게시 7~27 · 회원 1천 이상 · 그룹 */
export const NORMAL_POSTS_7D_MIN = 7;
export const NORMAL_MEMBER_MIN = 1_000;

/** 실패 뒤 재시도 간격의 상한 */
export const FAIL_BACKOFF_MAX_MS = 7 * DAY_MS;

export interface CollectBandInput {
  memberCount?: number | null;
  posts7d?: number | null;
  createdAt?: Date | string | null;
  linkType?: string | null;
}

function toMs(value: Date | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const at = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(at) ? at : null;
}

export function isNewCollectChannel(
  createdAt: Date | string | null | undefined,
  now: Date,
): boolean {
  const at = toMs(createdAt);
  if (at == null) return false;
  return now.getTime() - at < HOT_NEW_CHANNEL_DAYS * DAY_MS;
}

/** 게시 수·회원 수·등록일·종류로 수집 구간을 정한다. 위에서부터 먼저 맞는 구간이 이긴다. */
export function resolveCollectBand(
  input: CollectBandInput,
  now = new Date(),
): CollectBand {
  const members = input.memberCount ?? 0;
  const posts = input.posts7d ?? 0;
  if (
    isNewCollectChannel(input.createdAt, now) ||
    members >= HOT_MEMBER_MIN ||
    posts >= HOT_POSTS_7D_MIN
  ) {
    return 'hot';
  }
  if (
    posts >= NORMAL_POSTS_7D_MIN ||
    members >= NORMAL_MEMBER_MIN ||
    input.linkType === 'group'
  ) {
    return 'normal';
  }
  if (posts >= 1) return 'quiet';
  return 'dormant';
}

export function collectIntervalMs(
  input: CollectBandInput,
  now = new Date(),
): number {
  return COLLECT_BAND_INTERVAL_MS[resolveCollectBand(input, now)];
}

/**
 * 실패가 이어질 때 목표 간격에 곱하는 수. 실패 횟수(collect_fail_count, 이번 실패 포함) 기준:
 * 1회 → 1배, 2회 → 2배, 3회 이상 → 4배.
 */
export function failureBackoffMultiplier(failCount: number | null | undefined): number {
  const n = Math.max(0, Math.floor(Number(failCount) || 0));
  if (n <= 1) return 1;
  if (n === 2) return 2;
  return 4;
}

/** 수집 성공 후: 지금 + 목표 간격 */
export function nextCollectAtAfterSuccess(
  input: CollectBandInput,
  now = new Date(),
): Date {
  return new Date(now.getTime() + collectIntervalMs(input, now));
}

/** 수집 실패 후: 지금 + 목표 간격 × (1·2·4), 최대 7일 */
export function nextCollectAtAfterFailure(
  input: CollectBandInput,
  failCount: number | null | undefined,
  now = new Date(),
): Date {
  const wait = Math.min(
    collectIntervalMs(input, now) * failureBackoffMultiplier(failCount),
    FAIL_BACKOFF_MAX_MS,
  );
  return new Date(now.getTime() + wait);
}

/** 만료된 초대 링크: 7일 뒤에 다시 확인 */
export function nextCollectAtAfterInviteExpired(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_EXPIRED_RECHECK_MS);
}

/** 계정이 아님(invalid)으로 판별된 뒤: 판별 결과 재사용 기간(7일)이 지나면 다시 확인 */
export function nextCollectAtAfterInvalid(now = new Date()): Date {
  return new Date(now.getTime() + CLASSIFY_TTL_MS);
}

export function isCollectDue(
  nextCollectAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  const at = toMs(nextCollectAt);
  return at == null || at <= now.getTime();
}

export interface CollectQueueRow extends CollectBandInput {
  nextCollectAt?: Date | string | null;
  collectStatus?: string | null;
  collectFailCount?: number | null;
  lastCollectedAt?: Date | string | null;
}

export interface CollectBandSummary {
  /** 이 구간의 채널 수 */
  count: number;
  /** 지금 수집 시각이 지난(밀린) 채널 수 */
  overdue: number;
  /** 지금부터 24시간 안에 수집될 것으로 예상되는 횟수 */
  expected24h: number;
}

export interface CollectQueueSummary {
  total: number;
  overdue: number;
  expected24h: number;
  bands: Record<CollectBand, CollectBandSummary>;
}

const EXPECT_WINDOW_MS = DAY_MS;

/** 실패 중인 채널은 재시도 간격이 늘어나 있다 */
function effectiveIntervalMs(row: CollectQueueRow, now: Date): number {
  const base = collectIntervalMs(row, now);
  const status = row.collectStatus ?? 'ok';
  if (status === 'ok') return base;
  return Math.min(base * failureBackoffMultiplier(row.collectFailCount), FAIL_BACKOFF_MAX_MS);
}

/**
 * 수집 운영 화면용 요약. 병합(merged) 채널은 수집하지 않으므로 뺀다.
 * 예상 수집 수 = 이미 밀렸으면 지금 1번 + 그 뒤 간격마다 1번, 아니면 예정 시각부터 간격마다 1번(24시간 안).
 */
export function summarizeCollectQueue(
  rows: CollectQueueRow[],
  now = new Date(),
): CollectQueueSummary {
  const bands = Object.fromEntries(
    COLLECT_BANDS.map((band) => [band, { count: 0, overdue: 0, expected24h: 0 }]),
  ) as Record<CollectBand, CollectBandSummary>;
  let total = 0;
  let overdue = 0;
  let expected24h = 0;

  for (const row of rows) {
    if (row.collectStatus === 'merged') continue;
    const band = resolveCollectBand(row, now);
    const slot = bands[band];
    slot.count += 1;
    total += 1;

    const skipInvite = shouldSkipInviteExpiredRecheck(
      row.collectStatus,
      row.lastCollectedAt == null ? null : new Date(toMs(row.lastCollectedAt) ?? NaN),
      now.getTime(),
    );
    const nextAt = toMs(row.nextCollectAt);
    // 7일 규칙에 걸린 만료 초대 링크는 NULL 이어도 아직 대상이 아니다
    const dueNow = !skipInvite && (nextAt == null || nextAt <= now.getTime());
    if (dueNow) {
      slot.overdue += 1;
      overdue += 1;
    }

    const interval = effectiveIntervalMs(row, now);
    let firstInMs: number;
    if (dueNow) firstInMs = 0;
    else if (nextAt != null) firstInMs = nextAt - now.getTime();
    else {
      // 만료 초대 링크(NULL): 마지막 확인 7일 뒤
      const last = toMs(row.lastCollectedAt) ?? now.getTime();
      firstInMs = Math.max(0, last + INVITE_EXPIRED_RECHECK_MS - now.getTime());
    }
    if (firstInMs >= EXPECT_WINDOW_MS) continue;
    const times = 1 + Math.floor((EXPECT_WINDOW_MS - 1 - firstInMs) / interval);
    slot.expected24h += times;
    expected24h += times;
  }

  return { total, overdue, expected24h, bands };
}
