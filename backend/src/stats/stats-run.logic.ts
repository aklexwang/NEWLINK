import type { StatsCollectMode } from './stats-collect.logic';

export type StatsRunEndedReason = 'completed' | 'interrupted';

export type StatsRunStatus = 'running' | 'completed' | 'interrupted';

export type StatsRunLike = {
  id: string;
  processed: number;
  total: number;
  finishedAt: Date | string | null;
  endedReason: string | null;
};

export function isOpenStatsRun(run: {
  finishedAt: Date | string | null;
}): boolean {
  return run.finishedAt == null;
}

/** DB 기본값이 없어도 insert 되도록 id 를 앱에서 만든다 */
export function newStatsRunInsert(input: {
  total: number;
  startedAt?: Date;
  mode?: StatsCollectMode;
}): {
  id: string;
  startedAt: Date;
  finishedAt: null;
  processed: number;
  total: number;
  endedReason: null;
  mode: StatsCollectMode;
} {
  return {
    id: crypto.randomUUID(),
    startedAt: input.startedAt ?? new Date(),
    finishedAt: null,
    processed: 0,
    total: input.total,
    endedReason: null,
    mode: input.mode ?? 'full',
  };
}

export function interruptOpenStatsRuns<
  T extends { finishedAt: Date | string | null },
>(
  runs: T[],
  now: Date,
  endedReason: StatsRunEndedReason = 'interrupted',
): Array<T & { finishedAt: Date; endedReason: StatsRunEndedReason }> {
  return runs.filter(isOpenStatsRun).map((run) => ({
    ...run,
    finishedAt: now,
    endedReason,
  }));
}

export function toPublicStatsRun(run: StatsRunLike): {
  id: string;
  status: StatsRunStatus;
  processed: number;
  total: number;
} {
  let status: StatsRunStatus;
  if (run.endedReason === 'interrupted') {
    status = 'interrupted';
  } else if (run.finishedAt != null || run.endedReason === 'completed') {
    status = 'completed';
  } else {
    status = 'running';
  }
  return {
    id: run.id,
    status,
    processed: run.processed,
    total: run.total,
  };
}
