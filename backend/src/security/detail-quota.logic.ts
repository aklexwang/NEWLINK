/**
 * 채널 상세 하루 조회 상한 (텔레그램 계정마다). 2026-11-02 사용자 결정: 100개.
 * 진짜 회원은 하루 100개 넘게 상세를 열 일이 거의 없고, 하나씩 긁어 가는 프로그램은 여기서 걸린다.
 */
export const DETAIL_DAILY_LIMIT_DEFAULT = 100;

export function detailDailyLimit(raw?: string | null): number {
  if (raw == null || String(raw).trim() === '')
    return DETAIL_DAILY_LIMIT_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0
    ? Math.floor(n)
    : DETAIL_DAILY_LIMIT_DEFAULT;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DETAIL_RE = new RegExp(
  `^/api/channels/(?:by-username/[^/?#]+|${UUID})/detail(?:[?#]|$)`,
  'i',
);

/** 채널 상세 요청인지 (아이디로·uuid 로 둘 다) */
export function isChannelDetailPath(path: string): boolean {
  return DETAIL_RE.test(path);
}

/** 한국 시간 날짜 (yyyy-mm-dd) */
export function kstDay(now: number = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 하루 단위로 비우는 계정별 상세 조회 수 (서버 메모리) */
export class DailyDetailCounter {
  private day = '';
  private readonly counts = new Map<number, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** 한 번 세고 오늘 누적을 돌려준다 */
  hit(telegramId: number): number {
    const today = kstDay(this.now());
    if (today !== this.day) {
      this.day = today;
      this.counts.clear();
    }
    const next = (this.counts.get(telegramId) ?? 0) + 1;
    this.counts.set(telegramId, next);
    return next;
  }

  today(): string {
    return this.day || kstDay(this.now());
  }
}
