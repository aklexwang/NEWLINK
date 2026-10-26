export const ADMIN_LIGHT_RUN_BUSY_MESSAGE = '이미 수집이 돌고 있습니다';
export const ADMIN_LIGHT_RUN_ONLY_MESSAGE =
  'light 수집만 수동으로 시작할 수 있습니다.';

export type AdminStatsRunKind =
  | 'running'
  | 'completed'
  | 'budget'
  | 'interrupted';

export function remainingOf(processed: number, total: number): number {
  return Math.max(0, (total ?? 0) - (processed ?? 0));
}

export function classifyAdminStatsRun(run: {
  finishedAt?: Date | string | null;
  endedReason?: string | null;
  processed?: number;
  total?: number;
}): AdminStatsRunKind {
  if (run.endedReason === 'interrupted') return 'interrupted';
  if (run.finishedAt == null || run.finishedAt === '') return 'running';
  if (remainingOf(run.processed ?? 0, run.total ?? 0) > 0) return 'budget';
  return 'completed';
}

export function durationMs(
  startedAt: Date | string | null | undefined,
  finishedAt: Date | string | null | undefined,
  nowMs = Date.now(),
): number {
  const start = toTime(startedAt);
  if (start == null) return 0;
  const end = toTime(finishedAt) ?? nowMs;
  return Math.max(0, end - start);
}

export function formatDurationKo(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  if (minutes > 0) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

export function floodWaitSeconds(
  startedAt: Date | string | null | undefined,
  until: Date | string | null | undefined,
): number | null {
  const start = toTime(startedAt);
  const end = toTime(until);
  if (start == null || end == null) return null;
  return Math.max(0, Math.round((end - start) / 1000));
}

export function parseAdminStatsRunMode(
  raw: string | undefined,
): 'light' | null {
  if ((raw ?? '').trim().toLowerCase() === 'light') return 'light';
  return null;
}

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const at =
    value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(at) ? at : null;
}
