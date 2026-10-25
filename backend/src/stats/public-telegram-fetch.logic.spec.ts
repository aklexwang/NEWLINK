import { createPreviewTelegramFetcher } from './public-telegram-fetch.logic';
import { TmeGate } from './tme-gate';

function fakeResponse(options: {
  status: number;
  url?: string;
  retryAfter?: string;
  body?: string;
}): Response {
  return {
    status: options.status,
    url: options.url ?? 'https://t.me/x',
    headers: new Headers(
      options.retryAfter ? { 'retry-after': options.retryAfter } : undefined,
    ),
    text: async () => options.body ?? '<html></html>',
  } as Response;
}

describe('createPreviewTelegramFetcher', () => {
  it('429 는 대기 없이 빈 HTML 을 돌려준다', async () => {
    const fetchFn = jest.fn(async () =>
      fakeResponse({
        status: 429,
        retryAfter: '120',
        body: 'too many',
      }),
    ) as unknown as typeof fetch;
    const fetcher = createPreviewTelegramFetcher({
      fetchFn,
      gate: new TmeGate(),
    });
    const started = Date.now();
    const result = await fetcher.fetchHtml('https://t.me/x');
    expect(Date.now() - started).toBeLessThan(80);
    expect(result.status).toBe(429);
    expect(result.html).toBeNull();
    expect(result.error).toBe('fetch:429');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('동시 요청이 직렬로 밀리지 않는다', async () => {
    let inflight = 0;
    let maxInflight = 0;
    const startedAt: number[] = [];
    const fetchFn = jest.fn(async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      startedAt.push(Date.now());
      await new Promise((resolve) => setTimeout(resolve, 80));
      inflight -= 1;
      return fakeResponse({ status: 200 });
    }) as unknown as typeof fetch;
    const fetcher = createPreviewTelegramFetcher({
      fetchFn,
      gate: new TmeGate(),
    });
    const t0 = Date.now();
    await Promise.all(
      [0, 1, 2, 3].map((i) => fetcher.fetchHtml(`https://t.me/u${i}`)),
    );
    expect(maxInflight).toBe(4);
    expect(Math.max(...startedAt) - Math.min(...startedAt)).toBeLessThan(40);
    expect(Date.now() - t0).toBeLessThan(250);
  });
});
