import {
  FixedWindowRateLimiter,
  isBotUserAgent,
  visitorHash,
  visitorIdentity,
} from './request-actor.logic';

const SECRET = 'a'.repeat(64);

describe('isBotUserAgent', () => {
  it.each([
    '',
    '   ',
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0)',
    'curl/8.4.0',
    'python-requests/2.31.0',
    'Go-http-client/2.0',
    'Mozilla/5.0 HeadlessChrome/120.0',
    'Mozilla/5.0 (compatible; YandexBot/3.0)',
    'Mozilla/5.0 (compatible; Baiduspider/2.0)',
  ])('봇으로 판정: "%s"', (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Telegram-Android/10.5.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15 TelegramDesktop',
  ])('사람으로 판정: "%s"', (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });
});

describe('visitorHash', () => {
  const identity = visitorIdentity({
    memberId: null,
    ip: '203.0.113.7',
    userAgent: 'UA',
    acceptLanguage: 'ko-KR',
  });

  it('같은 날 같은 사람은 같은 해시, 길이 32의 16진수', () => {
    const a = visitorHash(SECRET, '2026-10-25', identity);
    expect(a).toBe(visitorHash(SECRET, '2026-10-25', identity));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it('날짜가 바뀌면 다른 해시', () => {
    expect(visitorHash(SECRET, '2026-10-25', identity)).not.toBe(
      visitorHash(SECRET, '2026-10-26', identity),
    );
  });

  it('IP·기기·언어가 다르면 다른 해시', () => {
    const base = visitorHash(SECRET, '2026-10-25', identity);
    for (const other of [
      { ip: '203.0.113.8', userAgent: 'UA', acceptLanguage: 'ko-KR' },
      { ip: '203.0.113.7', userAgent: 'UA2', acceptLanguage: 'ko-KR' },
      { ip: '203.0.113.7', userAgent: 'UA', acceptLanguage: 'en-US' },
    ]) {
      expect(
        visitorHash(
          SECRET,
          '2026-10-25',
          visitorIdentity({ memberId: null, ...other }),
        ),
      ).not.toBe(base);
    }
  });

  it('비밀키가 다르면 다른 해시이고 원본 IP 가 들어 있지 않다', () => {
    const a = visitorHash(SECRET, '2026-10-25', identity);
    const b = visitorHash('b'.repeat(64), '2026-10-25', identity);
    expect(a).not.toBe(b);
    expect(a).not.toContain('203');
  });

  it('로그인 회원은 ID 로 구분하고 IP 가 바뀌어도 같다', () => {
    const one = visitorIdentity({
      memberId: 42,
      ip: '1.1.1.1',
      userAgent: 'A',
      acceptLanguage: 'ko',
    });
    const two = visitorIdentity({
      memberId: 42,
      ip: '2.2.2.2',
      userAgent: 'B',
      acceptLanguage: 'en',
    });
    expect(visitorHash(SECRET, '2026-10-25', one)).toBe(
      visitorHash(SECRET, '2026-10-25', two),
    );
  });
});

describe('FixedWindowRateLimiter', () => {
  it('창 안에서 한도까지만 허용한다', () => {
    const limiter = new FixedWindowRateLimiter(3, 60_000);
    expect(limiter.allow('ip', 0)).toBe(true);
    expect(limiter.allow('ip', 1)).toBe(true);
    expect(limiter.allow('ip', 2)).toBe(true);
    expect(limiter.allow('ip', 3)).toBe(false);
    expect(limiter.allow('other', 3)).toBe(true);
  });

  it('창이 지나면 다시 허용한다', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000);
    expect(limiter.allow('ip', 0)).toBe(true);
    expect(limiter.allow('ip', 500)).toBe(false);
    expect(limiter.allow('ip', 1000)).toBe(true);
  });

  it('키가 가득 차도 메모리가 무한히 늘지 않는다', () => {
    const limiter = new FixedWindowRateLimiter(1, 1000, 10);
    for (let i = 0; i < 100; i += 1) limiter.allow(`k${i}`, 0);
    expect(limiter.size()).toBeLessThanOrEqual(10);
  });
});
