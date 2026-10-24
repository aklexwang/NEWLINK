export const ADMIN_COLLECT_COOLDOWN_MS = 60_000;
export const ADMIN_COLLECT_BULK_MAX = 20;
export const STATS_JOB_BUSY_MESSAGE =
  '정기 수집 중입니다. 끝난 뒤 다시 눌러 주세요';
/** finishedAt 이 비어 있어도 이보다 오래되면 실행 중으로 보지 않는다 */
export const STATS_RUN_RECENT_MS = 2 * 60 * 60 * 1000;

export function isRecentOpenStatsRun(
  run: { finishedAt?: Date | string | null; startedAt?: Date | string | null },
  nowMs = Date.now(),
  recentMs = STATS_RUN_RECENT_MS,
): boolean {
  if (run.finishedAt != null && run.finishedAt !== '') return false;
  const started =
    run.startedAt instanceof Date
      ? run.startedAt.getTime()
      : Date.parse(String(run.startedAt ?? ''));
  if (!Number.isFinite(started)) return false;
  return nowMs - started <= recentMs;
}

export function shouldBlockAdminCollect(
  jobRunning: boolean,
  openRuns: Array<{
    finishedAt?: Date | string | null;
    startedAt?: Date | string | null;
  }>,
  nowMs = Date.now(),
): boolean {
  if (jobRunning) return true;
  return openRuns.some((run) => isRecentOpenStatsRun(run, nowMs));
}

export function canAdminCollectNow(
  lastAtMs: number | undefined,
  nowMs: number,
  cooldownMs = ADMIN_COLLECT_COOLDOWN_MS,
): boolean {
  if (lastAtMs == null) return true;
  return nowMs - lastAtMs >= cooldownMs;
}

export function remainingCollectCooldownSec(
  lastAtMs: number | undefined,
  nowMs: number,
  cooldownMs = ADMIN_COLLECT_COOLDOWN_MS,
): number {
  if (lastAtMs == null) return 0;
  const left = cooldownMs - (nowMs - lastAtMs);
  if (left <= 0) return 0;
  return Math.ceil(left / 1000);
}

export function uniqueCollectIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export function assertBulkCollectSize(
  ids: string[],
  max = ADMIN_COLLECT_BULK_MAX,
): string[] {
  const unique = uniqueCollectIds(ids);
  if (unique.length === 0) {
    throw new Error('수집할 채널을 선택해 주세요.');
  }
  if (unique.length > max) {
    throw new Error(`한 번에 최대 ${max}개만 수집할 수 있습니다.`);
  }
  return unique;
}
