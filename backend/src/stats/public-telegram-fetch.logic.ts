import {
  describeFetchError,
  parseRetryAfterMs,
} from './collect-fetch';
import { TELEGRAM_FETCH_HEADERS } from './telegram-preview-html';
import { PUBLIC_INSPECT_GAP_MS } from './public-channel-inspect.logic';

const FETCH_TIMEOUT_MS = 12_000;
const PUBLIC_RETRY_AFTER_MAX_MS = 30 * 60 * 1000;
const PUBLIC_429_MAX_TRIES = 8;

/** 미리보기·아바타용. 간격 없이 동시에 최대 4개, 1회 시도, 8초 타임아웃. */
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
          const res = await fetchFn(url, {
            headers: TELEGRAM_FETCH_HEADERS,
            redirect: 'follow',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          const html = await res.text();
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

/** 미리보기·아바타 전용. 429 는 대기 없이 빈 HTML, 재시도 없음. */
export function createPreviewTelegramFetcher(options?: {
  fetchFn?: typeof fetch;
  maxConcurrent?: number;
}): {
  fetchHtml: (url: string) => Promise<PublicFetchResult>;
} {
  const fetchFn = options?.fetchFn ?? fetch;
  const maxConcurrent = options?.maxConcurrent ?? PREVIEW_FETCH_CONCURRENCY;
  let active = 0;
  const queue: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  }

  function release(): void {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  }

  return {
    async fetchHtml(url: string): Promise<PublicFetchResult> {
      await acquire();
      try {
        const res = await fetchFn(url, {
          headers: TELEGRAM_FETCH_HEADERS,
          redirect: 'follow',
          signal: AbortSignal.timeout(PREVIEW_FETCH_TIMEOUT_MS),
        });
        if (res.status === 429) {
          return {
            status: 429,
            html: null,
            finalUrl: res.url,
            error: 'fetch:429',
          };
        }
        const html = await res.text();
        return { status: res.status, html, finalUrl: res.url };
      } catch (error) {
        return {
          status: 0,
          html: null,
          finalUrl: null,
          error: describeFetchError(error),
        };
      } finally {
        release();
      }
    },
  };
}
