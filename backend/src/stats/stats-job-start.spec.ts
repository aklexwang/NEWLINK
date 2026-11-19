/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion */
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  Interval: () => () => undefined,
}));

import { StatsJobService } from './stats-job.service';

/**
 * 11/19 09:17: light 가 도는 동안 GitHub 예비 full 이 들어와(curl 재시도로 2번) 기다렸다가
 * 둘 다 시작 → 그날 두 번째 full 이 두 개 겹쳐 돌았다. 이 두 가지를 막는지 본다.
 */
function makeService(opts: { fullStartedMsAgo: number | null }) {
  const svc = Object.create(StatsJobService.prototype) as any;
  svc.status = {
    running: true,
    startedAt: null,
    finishedAt: null,
    processed: 0,
    total: 0,
    failed: 0,
  };
  svc.currentRunMode = 'light';
  svc.currentRunId = 'light-run';
  svc.pipelineStarting = false;
  svc.lastStartedAt = {
    light: Date.now(),
    full:
      opts.fullStartedMsAgo == null ? null : Date.now() - opts.fullStartedMsAgo,
  };
  svc.loadLastStartedAt = jest.fn(async () => null);
  let begun = 0;
  svc.beginRun = jest.fn(async (_t: number, mode: string) => {
    await new Promise((r) => setTimeout(r, 5));
    begun += 1;
    svc.status = { ...svc.status, running: true };
    svc.currentRunMode = mode;
    return { id: `run-${begun}` };
  });
  // light 가 곧 끝나서 기다리던 요청들이 동시에 깨어나는 상황
  svc.waitUntilIdle = jest.fn(async () => {
    await new Promise((r) => setTimeout(r, 10));
    svc.status = { ...svc.status, running: false };
    return true;
  });
  svc.runPipeline = jest.fn(() => new Promise(() => undefined));
  svc.runLightPipeline = jest.fn(() => new Promise(() => undefined));
  svc.finishRun = jest.fn(async () => undefined);
  return { svc, begun: () => begun };
}

describe('startPipeline 겹침 방지', () => {
  it('light 진행 중이어도 오늘 이미 full 을 시작했으면 예비 full 은 건너뛴다', async () => {
    const { svc, begun } = makeService({
      fullStartedMsAgo: 6 * 60 * 60 * 1000,
    });
    const result = await svc.startPipeline('full', { skipIfRecent: true });
    expect(result).toMatchObject({
      started: false,
      skipped: true,
      reason: 'recent',
    });
    expect(begun()).toBe(0);
    expect(svc.waitUntilIdle).not.toHaveBeenCalled();
  });

  it('기다리던 full 요청이 둘이어도 시작은 하나만', async () => {
    const { svc, begun } = makeService({ fullStartedMsAgo: null });
    const [a, b] = await Promise.all([
      svc.startPipeline('full', { skipIfRecent: true }),
      svc.startPipeline('full', { skipIfRecent: true }),
    ]);
    expect([a.started, b.started].filter(Boolean)).toHaveLength(1);
    expect(begun()).toBe(1);
    expect(svc.runPipeline).toHaveBeenCalledTimes(1);
  });
});
