/**
 * light 수집용 워커 풀.
 * 워커는 공용 커서에서 항목을 하나씩 가져가 처리하고, 항목 사이에 간격을 둔다.
 * 실제 t.me 동시 요청 수는 워커 수가 아니라 전역 게이트(TmeGate)가 정한다.
 */
export type CollectPoolOptions<T> = {
  items: T[];
  workers: number;
  /** 항목 하나를 처리하고 성공 여부를 돌려준다 */
  handle: (item: T) => Promise<boolean>;
  /** 항목 사이 간격 (호출할 때마다 최신 값) */
  gapMs: () => number;
  isBudgetOver: () => boolean;
  /** 전역 쿨다운이 남은 시간. 쿨다운 중에는 새 항목을 가져가지 않는다 */
  coolingRemainingMs: () => number;
  sleep: (ms: number) => Promise<void>;
  onProgress?: (progress: {
    processed: number;
    total: number;
    failed: number;
  }) => void;
  onBudgetStop?: (remaining: number) => void;
};

export type CollectPoolResult = {
  ok: number;
  fail: number;
  remaining: number;
};

/** 쿨다운 대기를 잘게 쪼개 예산 종료를 놓치지 않게 한다 */
const COOLING_POLL_MS = 5_000;

export async function runCollectPool<T>(
  options: CollectPoolOptions<T>,
): Promise<CollectPoolResult> {
  const { items } = options;
  const total = items.length;
  let next = 0;
  let taken = 0;
  let processed = 0;
  let ok = 0;
  let fail = 0;
  let stoppedByBudget = false;

  options.onProgress?.({ processed: 0, total, failed: 0 });

  async function worker(): Promise<void> {
    for (;;) {
      // 쿨다운 중에는 새 항목을 시작하지 않는다 (진행 중인 항목만 끝낸다)
      while (options.coolingRemainingMs() > 0 && !options.isBudgetOver()) {
        await options.sleep(
          Math.min(options.coolingRemainingMs(), COOLING_POLL_MS),
        );
      }
      // 첫 항목은 예산과 상관없이 처리한다 (기존 직렬 수집과 같은 규칙)
      if (taken > 0 && options.isBudgetOver()) {
        stoppedByBudget = true;
        return;
      }
      if (next >= total) return;
      const index = next;
      next += 1;
      taken += 1;
      const success = await options.handle(items[index]);
      if (success) ok += 1;
      else fail += 1;
      processed += 1;
      options.onProgress?.({ processed, total, failed: fail });
      if (next < total && !options.isBudgetOver()) {
        await options.sleep(options.gapMs());
      }
    }
  }

  const workerCount = Math.max(1, Math.min(options.workers, total || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  const remaining = Math.max(0, total - processed);
  if (stoppedByBudget && remaining > 0) options.onBudgetStop?.(remaining);
  return { ok, fail, remaining };
}
