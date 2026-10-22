import {
  CHANNEL_GAP_MS,
  CLASSIFY_TTL_MS,
  describeFetchError,
  FETCH_RETRY_DELAYS_MS,
  isClassifyFresh,
  parseRetryAfterMs,
  runFetchRetries,
  shouldRetrySameDayFailed,
  shouldSkipDailyCollect,
  shouldSkipInviteExpiredRecheck,
} from './collect-fetch';

describe('수집 재시도 간격', () => {
  it('실패 후 2초·5초·10초로 늘어난다', () => {
    expect(FETCH_RETRY_DELAYS_MS).toEqual([2_000, 5_000, 10_000]);
    expect(CHANNEL_GAP_MS).toBe(2_500);
  });
});

describe('HTTP 429 Retry-After', () => {
  it('초 단위 헤더를 밀리초로 바꾼다', () => {
    expect(parseRetryAfterMs('8')).toBe(8_000);
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('HTTP 날짜 헤더면 남은 시간을 쓴다', () => {
    const now = Date.parse('Wed, 21 Oct 2026 00:00:00 GMT');
    const header = 'Wed, 21 Oct 2026 00:00:12 GMT';
    expect(parseRetryAfterMs(header, now)).toBe(12_000);
  });

  it('없거나 이상한 값이면 첫 재시도 간격을 쓴다', () => {
    expect(parseRetryAfterMs(null)).toBe(2_000);
    expect(parseRetryAfterMs('nope')).toBe(2_000);
  });

  it('429면 Retry-After 만큼 기다린 뒤 다시 시도한다', async () => {
    const slept: number[] = [];
    let calls = 0;
    const result = await runFetchRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          return { status: 429, retryAfter: '5', html: 'slow' };
        }
        return { status: 200, html: 'ok' };
      },
      async (ms) => {
        slept.push(ms);
      },
    );
    expect(calls).toBe(2);
    expect(slept).toEqual([5_000]);
    expect(result).toEqual({ status: 200, html: 'ok', finalUrl: null });
  });
});

describe('fetch 오류 문구·상태 분류', () => {
  it('네트워크 코드를 fetch:CODE 로 남긴다', () => {
    const err = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    });
    expect(describeFetchError(err)).toBe('fetch:ECONNRESET');
  });

  it('타임아웃은 fetch:timeout 이다', () => {
    const err = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    expect(describeFetchError(err)).toBe('fetch:timeout');
  });

  it('ETIMEDOUT 도 타임아웃으로 보고 같은 날 failed 재시도 대상이다', () => {
    const err = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT',
    });
    expect(describeFetchError(err)).toBe('fetch:timeout');
    expect(shouldRetrySameDayFailed('failed', '2026-10-22', '2026-10-22')).toBe(
      true,
    );
  });

  it('ETIMEDOUT 이 나면 재시도 간격만큼 기다린 뒤 다시 요청한다', async () => {
    const slept: number[] = [];
    let calls = 0;
    const result = await runFetchRetries(
      async () => {
        calls += 1;
        if (calls === 1) {
          const err = Object.assign(new Error('connect ETIMEDOUT'), {
            code: 'ETIMEDOUT',
          });
          throw err;
        }
        return { status: 200, html: 'ok' };
      },
      async (ms) => {
        slept.push(ms);
      },
    );
    expect(calls).toBe(2);
    expect(slept).toEqual([2_000]);
    expect(result.status).toBe(200);
  });

  it('merged 만 매일 수집에서 빼고, failed 만 같은 날 재시도한다', () => {
    expect(shouldSkipDailyCollect('invite_only')).toBe(false);
    expect(shouldSkipDailyCollect('merged')).toBe(true);
    expect(shouldSkipDailyCollect('failed')).toBe(false);
    expect(shouldRetrySameDayFailed('failed', '2026-10-20', '2026-10-20')).toBe(
      true,
    );
    expect(shouldRetrySameDayFailed('invite_only', '2026-10-20', '2026-10-20')).toBe(
      false,
    );
    expect(shouldRetrySameDayFailed('failed', '2026-10-19', '2026-10-20')).toBe(
      false,
    );
  });

  it('계정 판별은 7일이 지나지 않았으면 재사용한다', () => {
    expect(CLASSIFY_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    const now = Date.parse('2026-10-20T12:00:00+09:00');
    const fresh = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const stale = new Date(now - 8 * 24 * 60 * 60 * 1000);
    expect(isClassifyFresh(fresh, now)).toBe(true);
    expect(isClassifyFresh(stale, now)).toBe(false);
    expect(isClassifyFresh(null, now)).toBe(false);
  });

  it('invite_expired 는 7일이 지나기 전에는 다시 확인하지 않는다', () => {
    const now = Date.parse('2026-10-22T12:00:00+09:00');
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000);
    expect(shouldSkipInviteExpiredRecheck('invite_expired', threeDaysAgo, now)).toBe(
      true,
    );
    expect(shouldSkipInviteExpiredRecheck('invite_expired', eightDaysAgo, now)).toBe(
      false,
    );
    expect(shouldSkipInviteExpiredRecheck('ok', threeDaysAgo, now)).toBe(false);
  });
});
