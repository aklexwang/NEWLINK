import { formatKstYmd } from './channel-metrics.math';

/**
 * t.me 전역 게이트.
 * 수집·대량 검사·발견·미리보기가 같은 서버 IP 로 t.me 를 두드리므로 한 곳에서 합산해 제한한다.
 * 상태는 메모리에만 두며 서버가 다시 뜨면 0부터 시작한다 (DB 변경 없음).
 * MTProto 와 텔레그램 Bot API(api.telegram.org)는 이 게이트를 지나지 않는다.
 */
export type TmeGateKind = 'collect' | 'preview' | 'inspect';

/** 수집용 동시 수 시작값 */
export const TME_COLLECT_START_LIMIT = 2;
/** 수집용 동시 수 상한 기본값 (환경변수 COLLECT_TME_CONCURRENCY_MAX) */
export const TME_COLLECT_MAX_DEFAULT = 3;
/** 미리보기 몫 */
export const TME_PREVIEW_LIMIT = 4;
/** 대량 검사·발견 몫 (각 fetcher 가 이미 직렬이라 1) */
export const TME_INSPECT_LIMIT = 1;
/** 종류 합계 동시 상한의 바닥 (수집 상한 + 2 와 비교해 큰 쪽) */
export const TME_TOTAL_MIN = 5;

export const TME_GAP_START_MS = 2_500;
export const TME_GAP_MIN_MS = 2_000;
export const TME_GAP_MAX_MS = 5_000;
export const TME_GAP_DECREASE_MS = 250;
export const TME_GAP_INCREASE_FACTOR = 1.5;

export const TME_COOLDOWN_MIN_MS = 30_000;
export const TME_COOLDOWN_MAX_MS = 30 * 60 * 1000;
export const TME_TIMEOUT_STREAK_LIMIT = 3;
export const TME_SUCCESS_STREAK_FOR_INCREASE = 100;
export const TME_INCREASE_INTERVAL_MS = 5 * 60 * 1000;
/** 하루 t.me 429 합계가 이 값을 넘으면 그날 수집 동시 수를 1 로 고정 */
export const TME_DAILY_429_LOCK = 30;

export type TmeGateOutcome = {
  /** HTTP 상태. 응답을 못 받았으면 생략 */
  status?: number;
  /** 서버가 알려 준 Retry-After (밀리초) */
  retryAfterMs?: number;
  /** 네트워크 오류 설명 (describeFetchError 값, 'fetch:timeout' 등) */
  error?: string;
};

export type TmeGateRunStats = {
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  /** 수집 요청이 동시에 날아간 최대 수 */
  peakCollectInflight: number;
  tme429: number;
  bot429: number;
  /** 쿨다운으로 멈춰 있던 시간 합계 (밀리초) */
  cooldownMs: number;
  /** 연속 타임아웃으로 감속이 걸린 횟수 */
  timeoutBackoffs: number;
};

export type TmeGateSnapshot = {
  collectLimit: number;
  collectMax: number;
  gapMs: number;
  coolingRemainingMs: number;
  lockedToday: boolean;
  today: { ymd: string; tme429: number; bot429: number };
  active: Record<TmeGateKind, number>;
  totalMax: number;
  run: TmeGateRunStats | null;
  lastRun: TmeGateRunStats | null;
};

export type TmeGateOptions = {
  collectMax?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

/** COLLECT_TME_CONCURRENCY_MAX 파싱. 1~4 정수만 인정하고 아니면 기본 3 */
export function parseTmeCollectMax(raw: string | undefined | null): number {
  const value = Number((raw ?? '').trim());
  if (!Number.isInteger(value) || value < 1) return TME_COLLECT_MAX_DEFAULT;
  return Math.min(value, 4);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TmeGate {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxCollect: number;
  private readonly totalMaxValue: number;

  private limit: number;
  private gap = TME_GAP_START_MS;
  private cooldownUntil = 0;
  private successStreak = 0;
  private timeoutStreak = 0;
  private lastAdjustAt: number;

  private ymd: string;
  private tme429Today = 0;
  private bot429Today = 0;
  private lockedYmd: string | null = null;

  private readonly active: Record<TmeGateKind, number> = {
    collect: 0,
    preview: 0,
    inspect: 0,
  };
  private waiters: Array<() => void> = [];

  private run: TmeGateRunStats | null = null;
  private lastRunStats: TmeGateRunStats | null = null;

  constructor(options: TmeGateOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxCollect = Math.max(1, Math.floor(options.collectMax ?? TME_COLLECT_MAX_DEFAULT));
    this.totalMaxValue = Math.max(TME_TOTAL_MIN, this.maxCollect + 2);
    this.limit = Math.min(TME_COLLECT_START_LIMIT, this.maxCollect);
    this.lastAdjustAt = this.now();
    this.ymd = formatKstYmd(new Date(this.now()));
  }

  /** 수집 워커 수 (워커가 이만큼 떠 있어도 실제 요청은 collectLimit 로 걸러진다) */
  collectMax(): number {
    return this.maxCollect;
  }

  /** 지금 허용되는 수집 동시 수 */
  collectLimit(): number {
    this.rollDay();
    if (this.lockedYmd === this.ymd) return 1;
    return Math.min(this.limit, this.maxCollect);
  }

  /** 수집 항목 사이 간격 */
  gapMs(): number {
    return this.gap;
  }

  coolingRemainingMs(): number {
    return Math.max(0, this.cooldownUntil - this.now());
  }

  isCooling(): boolean {
    return this.now() < this.cooldownUntil;
  }

  /**
   * 요청 자리를 얻는다. 쿨다운 중이면 끝날 때까지 기다린다.
   * 남은 쿨다운이 maxWaitMs 보다 길면 기다리지 않고 false 를 돌려준다
   * (기본값: 미리보기는 0 = 기다리지 않음, 나머지는 무제한).
   * true 를 받은 호출자는 반드시 release 해야 한다.
   */
  async acquire(
    kind: TmeGateKind,
    options?: { maxWaitMs?: number },
  ): Promise<boolean> {
    const maxWaitMs =
      options?.maxWaitMs ?? (kind === 'preview' ? 0 : Number.POSITIVE_INFINITY);
    for (;;) {
      this.rollDay();
      const nowMs = this.now();
      if (nowMs < this.cooldownUntil) {
        const remaining = this.cooldownUntil - nowMs;
        if (remaining > maxWaitMs) return false;
        await this.sleep(remaining);
        continue;
      }
      if (this.canStart(kind)) {
        this.active[kind] += 1;
        if (kind === 'collect' && this.run) {
          this.run.peakCollectInflight = Math.max(
            this.run.peakCollectInflight,
            this.active.collect,
          );
        }
        return true;
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  release(kind: TmeGateKind): void {
    if (this.active[kind] > 0) this.active[kind] -= 1;
    this.wake();
  }

  /** 요청 결과를 알린다. 429·연속 타임아웃은 감속, 연속 성공은 가속 */
  report(outcome: TmeGateOutcome): void {
    this.rollDay();
    if (outcome.status === 429) {
      this.onRateLimit(outcome.retryAfterMs);
      return;
    }
    if (outcome.error === 'fetch:timeout') {
      this.onTimeout();
      return;
    }
    this.timeoutStreak = 0;
    if (outcome.error || (outcome.status != null && outcome.status >= 500)) {
      this.successStreak = 0;
      return;
    }
    this.successStreak += 1;
    this.maybeIncrease();
  }

  /** 봇 API 429 기록. 봇은 이 게이트의 동시 수와 별개라 카운트만 한다 */
  noteBot429(): void {
    this.rollDay();
    this.bot429Today += 1;
    if (this.run) this.run.bot429 += 1;
  }

  beginRun(mode: string): void {
    this.run = {
      mode,
      startedAt: new Date(this.now()).toISOString(),
      finishedAt: null,
      peakCollectInflight: this.active.collect,
      tme429: 0,
      bot429: 0,
      cooldownMs: 0,
      timeoutBackoffs: 0,
    };
  }

  endRun(): void {
    if (!this.run) return;
    this.run.finishedAt = new Date(this.now()).toISOString();
    this.lastRunStats = this.run;
    this.run = null;
  }

  snapshot(): TmeGateSnapshot {
    this.rollDay();
    return {
      collectLimit: this.collectLimit(),
      collectMax: this.maxCollect,
      gapMs: this.gap,
      coolingRemainingMs: Math.max(0, this.cooldownUntil - this.now()),
      lockedToday: this.lockedYmd === this.ymd,
      today: {
        ymd: this.ymd,
        tme429: this.tme429Today,
        bot429: this.bot429Today,
      },
      active: { ...this.active },
      totalMax: this.totalMaxValue,
      run: this.run ? { ...this.run } : null,
      lastRun: this.lastRunStats ? { ...this.lastRunStats } : null,
    };
  }

  private kindLimit(kind: TmeGateKind): number {
    if (kind === 'collect') return this.collectLimit();
    if (kind === 'preview') return TME_PREVIEW_LIMIT;
    return TME_INSPECT_LIMIT;
  }

  private canStart(kind: TmeGateKind): boolean {
    const total = this.active.collect + this.active.preview + this.active.inspect;
    return total < this.totalMaxValue && this.active[kind] < this.kindLimit(kind);
  }

  private wake(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  private rollDay(): void {
    const today = formatKstYmd(new Date(this.now()));
    if (today === this.ymd) return;
    this.ymd = today;
    this.tme429Today = 0;
    this.bot429Today = 0;
    this.lockedYmd = null;
    this.wake();
  }

  private onRateLimit(retryAfterMs?: number): void {
    this.tme429Today += 1;
    if (this.run) this.run.tme429 += 1;
    if (this.tme429Today > TME_DAILY_429_LOCK) {
      this.lockedYmd = this.ymd;
    }
    this.startCooldown(retryAfterMs);
  }

  private onTimeout(): void {
    this.successStreak = 0;
    this.timeoutStreak += 1;
    if (this.timeoutStreak < TME_TIMEOUT_STREAK_LIMIT) return;
    this.timeoutStreak = 0;
    if (this.run) this.run.timeoutBackoffs += 1;
    this.startCooldown(undefined);
  }

  /** 쿨다운을 걸고(이미 쿨다운 중이면 연장만) 새로 걸린 때에만 한 번 감속한다 */
  private startCooldown(retryAfterMs: number | undefined): void {
    const nowMs = this.now();
    const wasCooling = nowMs < this.cooldownUntil;
    const waitMs = Math.min(
      Math.max(retryAfterMs ?? 0, TME_COOLDOWN_MIN_MS),
      TME_COOLDOWN_MAX_MS,
    );
    const until = nowMs + waitMs;
    if (until > this.cooldownUntil) {
      if (this.run) {
        this.run.cooldownMs += until - Math.max(nowMs, this.cooldownUntil);
      }
      this.cooldownUntil = until;
    }
    this.successStreak = 0;
    if (!wasCooling) this.decrease();
  }

  private decrease(): void {
    this.limit = Math.max(1, Math.floor(this.limit / 2));
    this.gap = Math.min(
      TME_GAP_MAX_MS,
      Math.round(this.gap * TME_GAP_INCREASE_FACTOR),
    );
    this.lastAdjustAt = this.now();
  }

  private maybeIncrease(): void {
    const nowMs = this.now();
    if (nowMs < this.cooldownUntil) return;
    if (this.lockedYmd === this.ymd) return;
    if (this.successStreak < TME_SUCCESS_STREAK_FOR_INCREASE) return;
    if (nowMs - this.lastAdjustAt < TME_INCREASE_INTERVAL_MS) return;
    this.limit = Math.min(this.maxCollect, this.limit + 1);
    this.gap = Math.max(TME_GAP_MIN_MS, this.gap - TME_GAP_DECREASE_MS);
    this.successStreak = 0;
    this.lastAdjustAt = nowMs;
    this.wake();
  }
}

let singleton: TmeGate | null = null;

/** 프로세스 안에서 하나만 쓰는 전역 게이트 */
export function getTmeGate(): TmeGate {
  if (!singleton) {
    singleton = new TmeGate({
      collectMax: parseTmeCollectMax(process.env.COLLECT_TME_CONCURRENCY_MAX),
    });
  }
  return singleton;
}

/** 테스트에서 전역 게이트를 갈아 끼운다 */
export function setTmeGateForTest(gate: TmeGate | null): void {
  singleton = gate;
}
