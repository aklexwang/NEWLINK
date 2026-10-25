/** 채널 점수 가중치 (합 1.0) */
export const WEIGHT_CHANNEL_SCALE = 0.3;
export const WEIGHT_CHANNEL_VIEW_RATE = 0.3;
export const WEIGHT_CHANNEL_ACTIVITY = 0.25;
export const WEIGHT_CHANNEL_GROWTH = 0.15;

/** 그룹 점수 가중치 — viewRate 없음 (합 1.0) */
export const WEIGHT_GROUP_SCALE = 0.45;
export const WEIGHT_GROUP_ACTIVITY = 0.4;
export const WEIGHT_GROUP_GROWTH = 0.15;

export const MANIPULATION_SCORE_MULTIPLIER = 0.6;
export const VIEW_RATE_SUSPECT = 1.0;
export const MEMBER_SPIKE_RATIO = 0.2;
export const VIEW_CV_SUSPECT = 0.03;
export const MIN_POSTS_FOR_CV = 5;
export const RANK_UP_STEPS = 10;
export const DATA_SHORT_DAYS = 7;

export const GRADE_S_MIN = 80;
export const GRADE_A_MIN = 65;
export const GRADE_B_MIN = 50;
export const GRADE_C_MIN = 35;

export const KST = 'Asia/Seoul';

export type ScoreGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export interface SnapshotPoint {
  capturedOn: string;
  memberCount: number;
  medianViews7d: number;
}

/**
 * 오름차순 배열에서 value의 경험적 백분위(0~1).
 * 값이 작을수록 0에 가깝고, 이상인 원소 비율입니다.
 */
export function percentile(value: number, sortedArray: number[]): number {
  if (sortedArray.length === 0) return 0;
  let lo = 0;
  let hi = sortedArray.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedArray[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sortedArray.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function coefficientOfVariation(values: number[]): number | null {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  if (mean === 0) return null;
  const variance =
    values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function growthRate(
  current: number | null,
  baseline: number | null,
): number | null {
  if (current == null || baseline == null || baseline <= 0) return null;
  return (current - baseline) / baseline;
}

/**
 * 같은 채널의 스냅샷이 서로 다른 날짜로 2일 이상일 때만 성장률을 계산합니다.
 * 옮겨 온 member_count 는 쓰지 않고, 오늘 값도 스냅샷 맵에 넣은 뒤 비교합니다.
 */
export function growthFromSnapshots(
  snapshots: { capturedOn: string; memberCount: number }[],
  todayYmd: string,
  todayMemberCount: number,
  daysBack: number,
): number | null {
  const byDay = new Map<string, number>();
  for (const snap of snapshots) {
    if (!snap.capturedOn) continue;
    byDay.set(snap.capturedOn, snap.memberCount);
  }
  byDay.set(todayYmd, todayMemberCount);
  if (byDay.size < 2) return null;
  return growthRate(
    byDay.get(todayYmd) ?? null,
    byDay.get(addKstDays(todayYmd, -daysBack)) ?? null,
  );
}

/**
 * 회원 증감 수(명) = 오늘 값 − N일 전 값. 기준일 기록이 없으면 null.
 * 증가율(%)에서 되돌려 계산하면 큰 채널은 오차가 생겨서, 화면에는 이 값을 우선 쓴다.
 */
export function memberDeltaFromSnapshots(
  snapshots: { capturedOn: string; memberCount: number }[],
  todayYmd: string,
  todayMemberCount: number,
  daysBack: number,
): number | null {
  const base = snapshots.find(
    (snap) => snap.capturedOn === addKstDays(todayYmd, -daysBack),
  );
  if (!base || base.memberCount == null) return null;
  if (!Number.isFinite(todayMemberCount) || todayMemberCount <= 0) return null;
  return Math.round(todayMemberCount - base.memberCount);
}

export function gradeFromTotal(total: number): ScoreGrade {
  if (total >= GRADE_S_MIN) return 'S';
  if (total >= GRADE_A_MIN) return 'A';
  if (total >= GRADE_B_MIN) return 'B';
  if (total >= GRADE_C_MIN) return 'C';
  return 'D';
}

/** 한국은 서머타임이 없어 UTC+9 고정 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * KST 날짜 YYYY-MM-DD.
 * 예전에는 부를 때마다 Intl.DateTimeFormat 을 새로 만들었는데, 이 객체가 무거워
 * 1.5만 개 채널 사이트맵 한 번에 메모리가 400MB 넘게 늘었다. 산술로 계산한다.
 */
export function formatKstYmd(date: Date = new Date()): string {
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new RangeError('Invalid time value');
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addKstDays(ymd: string, days: number): string {
  const pivot = new Date(`${ymd}T12:00:00+09:00`);
  pivot.setTime(pivot.getTime() + days * 24 * 60 * 60 * 1000);
  return formatKstYmd(pivot);
}

/** firstObservedAt(KST 날짜)부터 오늘까지 일수. 당일이면 1. */
export function countObservedDays(
  firstObservedAt: Date | null,
  todayYmd: string,
): number {
  if (!firstObservedAt) return 0;
  const first = formatKstYmd(firstObservedAt);
  const start = new Date(`${first}T00:00:00+09:00`).getTime();
  const end = new Date(`${todayYmd}T00:00:00+09:00`).getTime();
  if (end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function kstDayDiff(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T00:00:00+09:00`).getTime();
  const b = new Date(`${toYmd}T00:00:00+09:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function isManipulationSuspected(input: {
  viewRate: number | null;
  snapshots: SnapshotPoint[];
  recentViews: number[];
}): boolean {
  if (input.viewRate != null && input.viewRate > VIEW_RATE_SUSPECT) {
    return true;
  }

  const snaps = [...input.snapshots].sort((a, b) =>
    a.capturedOn.localeCompare(b.capturedOn),
  );
  for (let i = 1; i < snaps.length; i += 1) {
    if (kstDayDiff(snaps[i - 1].capturedOn, snaps[i].capturedOn) !== 1)
      continue;
    const prev = snaps[i - 1].memberCount;
    if (prev <= 0) continue;
    const dailyGrowth = (snaps[i].memberCount - prev) / prev;
    if (dailyGrowth < MEMBER_SPIKE_RATIO) continue;
    const later = snaps.slice(i + 1);
    if (later.length === 0) continue;
    const spikeMedian = snaps[i].medianViews7d;
    const viewsIncreased = later.some((s) => s.medianViews7d > spikeMedian);
    if (!viewsIncreased) return true;
  }

  if (input.recentViews.length >= MIN_POSTS_FOR_CV) {
    const cv = coefficientOfVariation(input.recentViews);
    if (cv != null && cv < VIEW_CV_SUSPECT) return true;
  }

  return false;
}

export function clampScore(total: number): number {
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, Math.min(100, Math.round(total)));
}
