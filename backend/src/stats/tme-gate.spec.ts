import {
  parseTmeCollectMax,
  TME_COOLDOWN_MIN_MS,
  TME_DAILY_429_LOCK,
  TME_GAP_MAX_MS,
  TME_GAP_MIN_MS,
  TME_GAP_START_MS,
  TME_INCREASE_INTERVAL_MS,
  TME_SUCCESS_STREAK_FOR_INCREASE,
  TmeGate,
  type TmeGateKind,
} from './tme-gate';

const START = Date.parse('2026-10-25T12:00:00+09:00');

function makeGate(collectMax = 3) {
  let t = START;
  const gate = new TmeGate({
    collectMax,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
  });
  return {
    gate,
    advance: (ms: number) => {
      t += ms;
    },
    now: () => t,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 자리를 요청하고, 바로 받았는지(true) 기다리는 중인지(false)를 돌려준다 */
async function tryTake(gate: TmeGate, kind: TmeGateKind): Promise<boolean> {
  let granted = false;
  void gate.acquire(kind).then((ok) => {
    granted = ok;
  });
  await flush();
  return granted;
}

function successes(gate: TmeGate, count: number) {
  for (let i = 0; i < count; i += 1) gate.report({ status: 200 });
}

describe('TmeGate 합산', () => {
  it('수집은 시작 2, 상한 3 안에서만 동시에 나간다', async () => {
    const { gate } = makeGate(3);
    expect(gate.collectLimit()).toBe(2);
    expect(await tryTake(gate, 'collect')).toBe(true);
    expect(await tryTake(gate, 'collect')).toBe(true);
    expect(await tryTake(gate, 'collect')).toBe(false);
    expect(gate.snapshot().active.collect).toBe(2);
  });

  it('수집·미리보기·검사가 한 합계 상한을 같이 쓴다', async () => {
    const { gate } = makeGate(3);
    const snapshot = gate.snapshot();
    expect(snapshot.totalMax).toBe(5);

    expect(await tryTake(gate, 'collect')).toBe(true);
    expect(await tryTake(gate, 'collect')).toBe(true);
    expect(await tryTake(gate, 'inspect')).toBe(true);
    // 검사 몫은 1 이라 두 번째는 못 받는다
    expect(await tryTake(gate, 'inspect')).toBe(false);
    // 지금 3 사용 중. 미리보기는 합계 5 까지만
    expect(await tryTake(gate, 'preview')).toBe(true);
    expect(await tryTake(gate, 'preview')).toBe(true);
    expect(await tryTake(gate, 'preview')).toBe(false);
    const active = gate.snapshot().active;
    expect(active.collect + active.preview + active.inspect).toBe(5);
  });

  it('반납하면 기다리던 요청이 이어서 나간다', async () => {
    const { gate } = makeGate(3);
    await tryTake(gate, 'collect');
    await tryTake(gate, 'collect');
    let third = false;
    void gate.acquire('collect').then((ok) => {
      third = ok;
    });
    await flush();
    expect(third).toBe(false);
    gate.release('collect');
    await flush();
    expect(third).toBe(true);
  });

  it('수집 상한은 환경변수 값을 따르고 잘못된 값은 3 이다', () => {
    expect(parseTmeCollectMax(undefined)).toBe(3);
    expect(parseTmeCollectMax('')).toBe(3);
    expect(parseTmeCollectMax('abc')).toBe(3);
    expect(parseTmeCollectMax('0')).toBe(3);
    expect(parseTmeCollectMax('1')).toBe(1);
    expect(parseTmeCollectMax('2')).toBe(2);
    expect(parseTmeCollectMax('99')).toBe(4);
    const { gate } = makeGate(1);
    expect(gate.collectLimit()).toBe(1);
  });
});

describe('TmeGate AIMD 감소', () => {
  it('429 는 쿨다운(최소 30초)·동시 절반·간격 x1.5 를 건다', () => {
    const { gate } = makeGate(3);
    gate.report({ status: 429 });
    const snapshot = gate.snapshot();
    expect(snapshot.collectLimit).toBe(1);
    expect(snapshot.gapMs).toBe(Math.round(TME_GAP_START_MS * 1.5));
    expect(snapshot.coolingRemainingMs).toBe(TME_COOLDOWN_MIN_MS);
  });

  it('Retry-After 가 30초보다 길면 그 값만큼 쉰다', () => {
    const { gate } = makeGate(3);
    gate.report({ status: 429, retryAfterMs: 90_000 });
    expect(gate.snapshot().coolingRemainingMs).toBe(90_000);
    const second = makeGate(3);
    second.gate.report({ status: 429, retryAfterMs: 5_000 });
    expect(second.gate.snapshot().coolingRemainingMs).toBe(TME_COOLDOWN_MIN_MS);
  });

  it('쿨다운 중 겹친 429 는 다시 줄이지 않고 쿨다운만 늘린다', () => {
    const { gate } = makeGate(3);
    gate.report({ status: 429 });
    const gapAfterFirst = gate.gapMs();
    gate.report({ status: 429, retryAfterMs: 120_000 });
    expect(gate.gapMs()).toBe(gapAfterFirst);
    expect(gate.collectLimit()).toBe(1);
    expect(gate.snapshot().coolingRemainingMs).toBe(120_000);
  });

  it('간격은 5초를 넘지 않고 동시 수는 1 아래로 내려가지 않는다', () => {
    const { gate, advance } = makeGate(3);
    for (let i = 0; i < 5; i += 1) {
      gate.report({ status: 429 });
      advance(TME_COOLDOWN_MIN_MS + 1);
    }
    expect(gate.gapMs()).toBe(TME_GAP_MAX_MS);
    expect(gate.collectLimit()).toBe(1);
  });

  it('연속 타임아웃 3회는 429 와 같은 감속을 건다', () => {
    const { gate } = makeGate(3);
    gate.report({ error: 'fetch:timeout' });
    gate.report({ error: 'fetch:timeout' });
    expect(gate.snapshot().coolingRemainingMs).toBe(0);
    expect(gate.collectLimit()).toBe(2);
    gate.report({ error: 'fetch:timeout' });
    const snapshot = gate.snapshot();
    expect(snapshot.collectLimit).toBe(1);
    expect(snapshot.coolingRemainingMs).toBe(TME_COOLDOWN_MIN_MS);
    // 타임아웃은 429 횟수에 넣지 않는다
    expect(snapshot.today.tme429).toBe(0);
  });

  it('타임아웃 사이에 성공이 끼면 연속으로 세지 않는다', () => {
    const { gate } = makeGate(3);
    gate.report({ error: 'fetch:timeout' });
    gate.report({ error: 'fetch:timeout' });
    gate.report({ status: 200 });
    gate.report({ error: 'fetch:timeout' });
    expect(gate.snapshot().coolingRemainingMs).toBe(0);
  });

  it('쿨다운 중에는 기다렸다가 나가고, 기다리지 않는 요청은 거절된다', async () => {
    const { gate, now } = makeGate(3);
    gate.report({ status: 429 });
    expect(await gate.acquire('collect', { maxWaitMs: 0 })).toBe(false);
    expect(await gate.acquire('preview')).toBe(false);
    const before = now();
    expect(await gate.acquire('inspect')).toBe(true);
    expect(now() - before).toBe(TME_COOLDOWN_MIN_MS);
  });
});

describe('TmeGate AIMD 증가', () => {
  it('100건 연속 성공 + 5분이 지나면 동시 +1, 간격 -0.25초', () => {
    const { gate, advance } = makeGate(3);
    gate.report({ status: 429 });
    advance(TME_COOLDOWN_MIN_MS + 1);
    const gapAfterDrop = gate.gapMs();
    expect(gate.collectLimit()).toBe(1);

    successes(gate, TME_SUCCESS_STREAK_FOR_INCREASE);
    // 성공 100건이어도 5분이 안 지났으면 그대로
    expect(gate.collectLimit()).toBe(1);

    advance(TME_INCREASE_INTERVAL_MS);
    successes(gate, TME_SUCCESS_STREAK_FOR_INCREASE);
    expect(gate.collectLimit()).toBe(2);
    expect(gate.gapMs()).toBe(gapAfterDrop - 250);
  });

  it('성공이 100건 안 되면 5분이 지나도 늘리지 않는다', () => {
    const { gate, advance } = makeGate(3);
    gate.report({ status: 429 });
    advance(TME_COOLDOWN_MIN_MS + TME_INCREASE_INTERVAL_MS);
    successes(gate, TME_SUCCESS_STREAK_FOR_INCREASE - 1);
    expect(gate.collectLimit()).toBe(1);
  });

  it('중간에 오류가 끼면 연속 성공을 처음부터 센다', () => {
    const { gate, advance } = makeGate(3);
    gate.report({ status: 429 });
    advance(TME_COOLDOWN_MIN_MS + TME_INCREASE_INTERVAL_MS);
    successes(gate, 60);
    gate.report({ status: 503 });
    successes(gate, 60);
    expect(gate.collectLimit()).toBe(1);
  });

  it('상한과 간격 하한(2.0초)을 넘지 않는다', () => {
    const { gate, advance } = makeGate(3);
    for (let round = 0; round < 10; round += 1) {
      advance(TME_INCREASE_INTERVAL_MS + 1);
      successes(gate, TME_SUCCESS_STREAK_FOR_INCREASE);
    }
    expect(gate.collectLimit()).toBe(3);
    expect(gate.gapMs()).toBe(TME_GAP_MIN_MS);
  });

  it('404 같은 4xx 응답은 성공으로 센다', () => {
    const { gate, advance } = makeGate(3);
    gate.report({ status: 429 });
    advance(TME_COOLDOWN_MIN_MS + TME_INCREASE_INTERVAL_MS);
    for (let i = 0; i < TME_SUCCESS_STREAK_FOR_INCREASE; i += 1) {
      gate.report({ status: 404 });
    }
    expect(gate.collectLimit()).toBe(2);
  });
});

describe('TmeGate 하루 429 상한', () => {
  it('하루 429 합계가 30을 넘으면 그날은 동시 1 로 고정한다', () => {
    const { gate, advance } = makeGate(3);
    for (let i = 0; i < TME_DAILY_429_LOCK; i += 1) {
      gate.report({ status: 429 });
    }
    expect(gate.snapshot().lockedToday).toBe(false);
    gate.report({ status: 429 });
    expect(gate.snapshot().lockedToday).toBe(true);
    expect(gate.snapshot().today.tme429).toBe(TME_DAILY_429_LOCK + 1);

    // 잠긴 날에는 성공이 쌓여도 늘리지 않는다
    advance(TME_COOLDOWN_MIN_MS + 1);
    for (let round = 0; round < 3; round += 1) {
      advance(TME_INCREASE_INTERVAL_MS);
      successes(gate, TME_SUCCESS_STREAK_FOR_INCREASE);
    }
    expect(gate.collectLimit()).toBe(1);
  });

  it('잠긴 날에는 한 번 늘어나 있던 값이 있어도 1 만 쓴다', () => {
    const { gate, advance } = makeGate(3);
    for (let round = 0; round < 3; round += 1) {
      advance(TME_INCREASE_INTERVAL_MS + 1);
      successes(gate, TME_SUCCESS_STREAK_FOR_INCREASE);
    }
    expect(gate.collectLimit()).toBe(3);
    // 하루 중 429 가 31번 → 감소가 겹쳐도 잠금은 1
    for (let i = 0; i <= TME_DAILY_429_LOCK; i += 1)
      gate.report({ status: 429 });
    expect(gate.collectLimit()).toBe(1);
  });

  it('KST 날짜가 바뀌면 카운트와 고정이 풀린다', () => {
    const { gate, advance } = makeGate(3);
    gate.report({ status: 429 });
    gate.noteBot429();
    for (let i = 0; i < TME_DAILY_429_LOCK; i += 1)
      gate.report({ status: 429 });
    expect(gate.snapshot().lockedToday).toBe(true);

    advance(24 * 60 * 60 * 1000);
    const snapshot = gate.snapshot();
    expect(snapshot.lockedToday).toBe(false);
    expect(snapshot.today.tme429).toBe(0);
    expect(snapshot.today.bot429).toBe(0);
  });
});

describe('TmeGate 회차 기록', () => {
  it('회차 동안의 최대 동시 수·429·쿨다운 합계를 모은다', async () => {
    const { gate } = makeGate(3);
    gate.beginRun('light');
    await gate.acquire('collect');
    await gate.acquire('collect');
    gate.report({ status: 429 });
    gate.noteBot429();
    gate.noteBot429();
    gate.release('collect');
    gate.release('collect');
    expect(gate.snapshot().run?.mode).toBe('light');

    gate.endRun();
    const snapshot = gate.snapshot();
    expect(snapshot.run).toBeNull();
    expect(snapshot.lastRun).toMatchObject({
      mode: 'light',
      peakCollectInflight: 2,
      tme429: 1,
      bot429: 2,
      cooldownMs: TME_COOLDOWN_MIN_MS,
    });
    expect(snapshot.lastRun?.finishedAt).not.toBeNull();
    expect(snapshot.today.bot429).toBe(2);
  });
});
