export const COLLECT_LIGHT_BUDGET_MIN_DEFAULT = 25;
export const COLLECT_FULL_BUDGET_MIN_DEFAULT = 95;

export function collectBudgetMinutes(
  mode: 'light' | 'full',
  env: {
    COLLECT_LIGHT_BUDGET_MIN?: string;
    COLLECT_FULL_BUDGET_MIN?: string;
  } = {},
): number {
  const raw =
    mode === 'light'
      ? env.COLLECT_LIGHT_BUDGET_MIN
      : env.COLLECT_FULL_BUDGET_MIN;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return mode === 'light'
    ? COLLECT_LIGHT_BUDGET_MIN_DEFAULT
    : COLLECT_FULL_BUDGET_MIN_DEFAULT;
}

export function collectBudgetMs(
  mode: 'light' | 'full',
  env?: {
    COLLECT_LIGHT_BUDGET_MIN?: string;
    COLLECT_FULL_BUDGET_MIN?: string;
  },
): number {
  return collectBudgetMinutes(mode, env) * 60_000;
}

export function isCollectBudgetOver(
  deadlineMs: number | undefined,
  nowMs = Date.now(),
): boolean {
  return deadlineMs != null && nowMs >= deadlineMs;
}

export function orderChannelsForCollect<
  T extends { id: string; lastCollectedAt?: Date | string | null },
>(channels: T[]): T[] {
  return [...channels].sort((a, b) => {
    const ta = collectTime(a.lastCollectedAt);
    const tb = collectTime(b.lastCollectedAt);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

export function sliceRankingPage<T>(
  items: T[],
  offset: number | undefined,
  limit: number | undefined,
): T[] {
  const off = Number.isFinite(offset) ? Math.max(0, Math.floor(Number(offset))) : 0;
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  return items.slice(off, off + lim);
}

function collectTime(value: Date | string | null | undefined): number {
  if (value == null || value === '') return 0;
  const at = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(at) ? at : 0;
}
