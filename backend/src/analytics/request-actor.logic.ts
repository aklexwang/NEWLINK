import { createHmac } from 'crypto';

/**
 * 봇·크롤러·스크립트 User-Agent 판별. 비어 있으면 봇으로 본다.
 * 텔레그램 앱 안 웹뷰의 "Telegram" 표기는 사람이므로 제외하지 않는다.
 * (링크 미리보기 봇은 "TelegramBot (like TwitterBot)" 형태라 bot\b 로 걸러진다.)
 */
const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|scrapy|curl\/|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|libwww|headless|phantomjs|puppeteer|playwright|lighthouse|facebookexternalhit|embedly|preview|monitor|uptime|pingdom|axios\/|node-fetch|java\//i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? '').trim();
  if (!ua) return true;
  return BOT_UA.test(ua);
}

/** 방문자 구분용 원문. 로그인 ID 가 있으면 ID, 없으면 IP+기기 정보. 저장하지 않고 해시에만 쓴다. */
export function visitorIdentity(input: {
  memberId: number | null;
  ip: string;
  userAgent: string;
  acceptLanguage: string;
}): string {
  if (input.memberId !== null) return `u:${input.memberId}`;
  return `a:${input.ip}|${input.userAgent}|${input.acceptLanguage}`;
}

/**
 * 방문자 해시. 하루 단위 솔트(HMAC(비밀키, 날짜))로 한 번 더 HMAC 하므로
 * 비밀키 없이는 되돌릴 수 없고 날짜가 바뀌면 같은 사람도 다른 값이 된다.
 * 앞 32자(16바이트)만 저장한다.
 */
export function visitorHash(
  secret: string,
  kstDate: string,
  identity: string,
): string {
  const salt = createHmac('sha256', secret)
    .update(`visitor:${kstDate}`)
    .digest();
  return createHmac('sha256', salt).update(identity).digest('hex').slice(0, 32);
}

/** 고정 창(window) 방식 요청 제한. 메모리에만 저장하며 서버가 여러 대면 대마다 따로 센다. */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** 허용되면 true. 한도를 넘으면 false. */
  allow(key: string, now: number = Date.now()): boolean {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) this.prune(now);
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (bucket.count >= this.limit) return false;
    bucket.count += 1;
    return true;
  }

  size(): number {
    return this.buckets.size;
  }

  private prune(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    // 만료된 게 없는데 가득 찼으면 가장 오래된 절반을 버려 메모리 폭증을 막는다.
    if (this.buckets.size >= this.maxKeys) {
      let drop = Math.ceil(this.maxKeys / 2);
      for (const key of this.buckets.keys()) {
        if (drop-- <= 0) break;
        this.buckets.delete(key);
      }
    }
  }
}
