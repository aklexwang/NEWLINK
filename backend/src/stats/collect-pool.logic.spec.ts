import { runCollectPool } from './collect-pool.logic';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('runCollectPool', () => {
  it('항목을 모두 처리하고 성공·실패를 센다', async () => {
    const result = await runCollectPool({
      items: [1, 2, 3, 4, 5],
      workers: 3,
      handle: async (n) => n % 2 === 1,
      gapMs: () => 0,
      isBudgetOver: () => false,
      coolingRemainingMs: () => 0,
      sleep: async () => undefined,
    });
    expect(result).toEqual({ ok: 3, fail: 2, remaining: 0 });
  });

  it('같은 항목을 두 번 처리하지 않고 워커 수만큼 동시에 돈다', async () => {
    const seen: number[] = [];
    let inflight = 0;
    let peak = 0;
    await runCollectPool({
      items: Array.from({ length: 12 }, (_, i) => i),
      workers: 3,
      handle: async (n) => {
        seen.push(n);
        inflight += 1;
        peak = Math.max(peak, inflight);
        await delay(5);
        inflight -= 1;
        return true;
      },
      gapMs: () => 0,
      isBudgetOver: () => false,
      coolingRemainingMs: () => 0,
      sleep: async () => undefined,
    });
    expect(seen.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
    expect(peak).toBe(3);
  });

  it('항목 사이에 최신 간격만큼 쉰다', async () => {
    const slept: number[] = [];
    let gap = 2500;
    await runCollectPool({
      items: [1, 2, 3],
      workers: 1,
      handle: async () => {
        gap += 500;
        return true;
      },
      gapMs: () => gap,
      isBudgetOver: () => false,
      coolingRemainingMs: () => 0,
      sleep: async (ms) => {
        slept.push(ms);
      },
    });
    // 마지막 항목 뒤에는 쉬지 않는다
    expect(slept).toEqual([3000, 3500]);
  });

  it('시간 예산이 끝나면 남은 항목을 두고 멈춘다 (첫 항목은 처리)', async () => {
    let over = false;
    const stops: number[] = [];
    const done: number[] = [];
    const result = await runCollectPool({
      items: [1, 2, 3, 4, 5, 6],
      workers: 2,
      handle: async (n) => {
        done.push(n);
        if (done.length >= 3) over = true;
        return true;
      },
      gapMs: () => 0,
      isBudgetOver: () => over,
      coolingRemainingMs: () => 0,
      sleep: async () => undefined,
      onBudgetStop: (remaining) => stops.push(remaining),
    });
    expect(result.ok).toBe(done.length);
    expect(result.remaining).toBe(6 - done.length);
    expect(result.remaining).toBeGreaterThan(0);
    expect(stops).toEqual([result.remaining]);

    const alreadyOver = await runCollectPool({
      items: [1, 2],
      workers: 1,
      handle: async () => true,
      gapMs: () => 0,
      isBudgetOver: () => true,
      coolingRemainingMs: () => 0,
      sleep: async () => undefined,
    });
    expect(alreadyOver).toEqual({ ok: 1, fail: 0, remaining: 1 });
  });

  it('쿨다운 중에는 새 항목을 시작하지 않는다', async () => {
    let cooling = 30_000;
    const order: string[] = [];
    await runCollectPool({
      items: [1],
      workers: 1,
      handle: async () => {
        order.push('handle');
        return true;
      },
      gapMs: () => 0,
      isBudgetOver: () => false,
      coolingRemainingMs: () => cooling,
      sleep: async (ms) => {
        order.push(`sleep:${ms}`);
        cooling = 0;
      },
    });
    expect(order).toEqual(['sleep:5000', 'handle']);
  });

  it('진행 상황을 항목마다 알린다', async () => {
    const progress: Array<{ processed: number; total: number; failed: number }> =
      [];
    await runCollectPool({
      items: ['a', 'b'],
      workers: 1,
      handle: async (v) => v === 'a',
      gapMs: () => 0,
      isBudgetOver: () => false,
      coolingRemainingMs: () => 0,
      sleep: async () => undefined,
      onProgress: (p) => progress.push(p),
    });
    expect(progress).toEqual([
      { processed: 0, total: 2, failed: 0 },
      { processed: 1, total: 2, failed: 0 },
      { processed: 2, total: 2, failed: 1 },
    ]);
  });

  it('항목이 없으면 바로 끝난다', async () => {
    const result = await runCollectPool({
      items: [],
      workers: 3,
      handle: async () => true,
      gapMs: () => 0,
      isBudgetOver: () => false,
      coolingRemainingMs: () => 0,
      sleep: async () => undefined,
    });
    expect(result).toEqual({ ok: 0, fail: 0, remaining: 0 });
  });
});
