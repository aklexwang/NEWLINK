/** t.me 요청이 실패한 뒤 재시도 간격 (2초 → 5초 → 10초) */
export const FETCH_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;

/** 채널 사이 대기 */
export const CHANNEL_GAP_MS = 2_500;

/** 계정 종류 판별 결과 재사용 기간 */
export const CLASSIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_RETRY_AFTER_MS = 120_000;

export function parseRetryAfterMs(
  header: string | null | undefined,
  now = Date.now(),
): number {
  if (!header?.trim()) return FETCH_RETRY_DELAYS_MS[0];
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const at = Date.parse(trimmed);
  if (!Number.isNaN(at)) {
    return Math.max(0, Math.min(at - now, MAX_RETRY_AFTER_MS));
  }
  return FETCH_RETRY_DELAYS_MS[0];
}

export function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String(error.name) : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    /timeout|timed out|aborted/i.test(message)
  );
}

export function extractNetworkCode(error: unknown): string | null {
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === 'object'; i += 1) {
    const rec = current as { code?: unknown; cause?: unknown; errno?: unknown };
    if (typeof rec.code === 'string' && rec.code.trim()) return rec.code.trim();
    if (typeof rec.errno === 'string' && rec.errno.trim()) return rec.errno.trim();
    current = rec.cause;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  const match = message.match(
    /\b(ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EPIPE|UND_ERR_[A-Z0-9_]+)\b/i,
  );
  return match ? match[1] : null;
}

export function describeFetchError(error: unknown): string {
  if (isTimeoutError(error)) return 'fetch:timeout';
  const code = extractNetworkCode(error);
  if (code) return `fetch:${code}`;
  return 'fetch:network';
}

export function isClassifyFresh(
  classifiedAt: Date | null | undefined,
  now = Date.now(),
): boolean {
  if (!classifiedAt) return false;
  const at = classifiedAt.getTime();
  if (Number.isNaN(at)) return false;
  return now - at < CLASSIFY_TTL_MS;
}

/** 만료된 초대 링크를 다시 확인하기까지 대기 */
export const INVITE_EXPIRED_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldSkipDailyCollect(
  collectStatus: string | null | undefined,
): boolean {
  return collectStatus === 'merged';
}

export function shouldSkipInviteExpiredRecheck(
  collectStatus: string | null | undefined,
  lastCollectedAt: Date | null | undefined,
  now = Date.now(),
): boolean {
  if (collectStatus !== 'invite_expired') return false;
  if (!lastCollectedAt) return false;
  const at = lastCollectedAt.getTime();
  if (Number.isNaN(at)) return false;
  return now - at < INVITE_EXPIRED_RECHECK_MS;
}

export function shouldRetrySameDayFailed(
  collectStatus: string | null | undefined,
  lastCollectedYmd: string | null | undefined,
  todayYmd: string,
): boolean {
  if (collectStatus !== 'failed') return false;
  if (!lastCollectedYmd) return false;
  return lastCollectedYmd === todayYmd;
}

export type FetchAttemptOk = {
  status: number;
  retryAfter?: string | null;
  html: string | null;
  finalUrl?: string | null;
};

export async function runFetchRetries(
  attempt: () => Promise<FetchAttemptOk>,
  sleepFn: (ms: number) => Promise<void>,
  now = () => Date.now(),
): Promise<{
  status: number;
  html: string | null;
  error?: string;
  finalUrl?: string | null;
}> {
  const maxTries = FETCH_RETRY_DELAYS_MS.length + 1;
  let lastError = 'fetch:network';
  let lastStatus = 0;
  let lastHtml: string | null = null;
  let lastUrl: string | null = null;

  for (let tryIndex = 0; tryIndex < maxTries; tryIndex += 1) {
    try {
      const result = await attempt();
      lastStatus = result.status;
      lastHtml = result.html;
      lastUrl = result.finalUrl ?? null;
      if (result.status === 429) {
        lastError = 'fetch:429';
        if (tryIndex >= maxTries - 1) {
          return {
            status: 429,
            html: result.html,
            error: 'fetch:429',
            finalUrl: lastUrl,
          };
        }
        await sleepFn(parseRetryAfterMs(result.retryAfter, now()));
        continue;
      }
      return {
        status: result.status,
        html: result.html,
        finalUrl: lastUrl,
      };
    } catch (error) {
      lastError = describeFetchError(error);
      lastStatus = 0;
      lastHtml = null;
      lastUrl = null;
      if (tryIndex >= maxTries - 1) break;
      await sleepFn(FETCH_RETRY_DELAYS_MS[tryIndex]);
    }
  }

  return {
    status: lastStatus,
    html: lastHtml,
    error: lastError,
    finalUrl: lastUrl,
  };
}
