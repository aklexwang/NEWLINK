import { describeFetchError, parseRetryAfterMs } from './collect-fetch';
import { TELEGRAM_FETCH_HEADERS } from './telegram-preview-html';
import { PUBLIC_INSPECT_GAP_MS } from './public-channel-inspect.logic';
import { getTmeGate, type TmeGate } from './tme-gate';

const FETCH_TIMEOUT_MS = 12_000;
const PUBLIC_RETRY_AFTER_MAX_MS = 30 * 60 * 1000;
const PUBLIC_429_MAX_TRIES = 8;

/** 미리보기·아바타용. 간격 없이 게이트 미리보기 몫(4)만큼 동시에, 1회 시도, 8초 타임아웃. */
export const PREVIEW_FETCH_TIMEOUT_MS = 8_000;
export const PREVIEW_FETCH_CONCURRENCY = 4;

export type PublicFetchResult = {
  status: number;
  html: string | null;
  finalUrl: string | null;
  error?: string;
};

export function createPublicTelegramFetcher(options?: {
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  fetchFn?: typeof fetch;
  gate?: TmeGate;
}): {
  fetchHtml: (url: string) => Promise<PublicFetchResult>;
} {
  const gapMs = options?.gapMs ?? PUBLIC_INSPECT_GAP_MS;
  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options?.now ?? Date.now;
  const fetchFn = options?.fetchFn ?? fetch;
  let lastAt = 0;

  return {
    async fetchHtml(url: string): Promise<PublicFetchResult> {
      // 대량 검사·발견은 수집·미리보기와 같은 전역 t.me 게이트를 지난다
      const gate = options?.gate ?? getTmeGate();
      let last: PublicFetchResult = {
        status: 0,
        html: null,
        finalUrl: null,
        error: 'fetch:network',
      };
      for (let tryIndex = 0; tryIndex < PUBLIC_429_MAX_TRIES; tryIndex += 1) {
        const wait = gapMs - (now() - lastAt);
        if (wait > 0) await sleep(wait);
        lastAt = now();
        try {
          await gate.acquire('inspect');
          let res: Response;
          let html: string;
          try {
            res = await fetchFn(url, {
              headers: TELEGRAM_FETCH_HEADERS,
              redirect: 'follow',
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            html = await res.text();
            gate.report({
              status: res.status,
              retryAfterMs:
                res.status === 429
                  ? parseRetryAfterMs(
                      res.headers.get('retry-after'),
                      now(),
                      PUBLIC_RETRY_AFTER_MAX_MS,
                    )
                  : undefined,
            });
          } catch (error) {
            gate.report({ error: describeFetchError(error) });
            throw error;
          } finally {
            gate.release('inspect');
          }
          last = {
            status: res.status,
            html,
            finalUrl: res.url,
          };
          if (res.status !== 429) return last;
          last.error = 'fetch:429';
          if (tryIndex >= PUBLIC_429_MAX_TRIES - 1) return last;
          await sleep(
            parseRetryAfterMs(
              res.headers.get('retry-after'),
              now(),
              PUBLIC_RETRY_AFTER_MAX_MS,
            ),
          );
        } catch (error) {
          last = {
            status: 0,
            html: null,
            finalUrl: null,
            error: describeFetchError(error),
          };
          if (tryIndex >= PUBLIC_429_MAX_TRIES - 1) return last;
          await sleep(2_000);
        }
      }
      return last;
    },
  };
}

/** 미리보기·아바타 전용. 429 는 대기 없이 빈 HTML, 재시도 없음. 동시 수는 전역 게이트의 미리보기 몫을 쓴다. */
export function createPreviewTelegramFetcher(options?: {
  fetchFn?: typeof fetch;
  gate?: TmeGate;
}): {
  fetchHtml: (url: string) => Promise<PublicFetchResult>;
} {
  const fetchFn = options?.fetchFn ?? fetch;

  return {
    async fetchHtml(url: string): Promise<PublicFetchResult> {
      const gate = options?.gate ?? getTmeGate();
      // 전역 쿨다운 중에는 사용자를 붙잡지 않고 바로 한도 응답으로 돌려준다
      if (!(await gate.acquire('preview'))) {
        return {
          status: 429,
          html: null,
          finalUrl: null,
          error: 'fetch:429',
        };
      }
      try {
        const res = await fetchFn(url, {
          headers: TELEGRAM_FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(PREVIEW_FETCH_TIMEOUT_MS),
        });
        if (res.status === 429) {
          gate.report({
            status: 429,
            retryAfterMs: parseRetryAfterMs(res.headers.get('retry-after')),
          });
          return {
            status: 429,
            html: null,
            finalUrl: res.url,
            error: 'fetch:429',
          };
        }
        const html = await res.text();
        gate.report({ status: res.status });
        return { status: res.status, html, finalUrl: res.url };
      } catch (error) {
        const described = describeFetchError(error);
        gate.report({ error: described });
        return {
          status: 0,
          html: null,
          finalUrl: null,
          error: described,
        };
      } finally {
        gate.release('preview');
      }
    },
  };
}
