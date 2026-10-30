/**
 * 텔레그램 미니앱 전용 서비스(2026-10-30 결정): 공개 API 는 텔레그램 서명(initData)이 있는 요청만 받는다.
 * API 주소를 알아도 텔레그램 밖에서 목록을 긁어 갈 수 없게 하려는 것.
 * 예외는 아래 경로뿐(각자 자기 방식으로 인증하거나, <img> 처럼 헤더를 못 붙이는 것).
 */
const OPEN_PREFIXES = [
  '/api/admin/', // 관리자 JWT 가드
  '/api/internal/', // 내부 토큰 (GitHub 수집 깨우기)
  '/api/auth/', // 로그인 자체 (미니앱 initData 를 본문으로 받음)
  '/api/images/', // <img> 이미지
  '/api/media/', // 방 프로필 사진
  '/api/uploads/', // 예전 업로드 파일(<img>)
];

const OPEN_EXACT = new Set([
  '/api',
  '/api/',
  '/api/health',
  '/api/payments/webhook', // 텔레그램 결제 알림
]);

/** 광고 배너 그림(<img>) */
const BANNER_IMAGE_RE = /^\/api\/ads\/banners\/[0-9a-f-]{36}\/image$/i;
/** 텔레그램 이동 기록(이동 버튼을 누를 때 따로 보내는 가벼운 신호. 데이터를 돌려주지 않는다) */
const OPEN_TRACK_RE =
  /^\/api\/(channels\/[0-9a-f-]{36}\/telegram-open|ads\/(banners|rank)\/[0-9a-f-]{36}\/click)$/i;

export function isOpenPath(path: string): boolean {
  const p = path.split('?')[0];
  if (OPEN_EXACT.has(p)) return true;
  if (!p.startsWith('/api')) return true; // API 가 아닌 경로는 이 문지기와 상관없음
  if (OPEN_PREFIXES.some((prefix) => p.startsWith(prefix))) return true;
  return BANNER_IMAGE_RE.test(p) || OPEN_TRACK_RE.test(p);
}

export type GateDecision = 'allow' | 'deny';

export function decideMiniAppGate(input: {
  enabled: boolean;
  method: string;
  path: string;
  hasValidInitData: boolean;
  hasValidAdmin: boolean;
}): GateDecision {
  if (!input.enabled) return 'allow';
  if (input.method.toUpperCase() === 'OPTIONS') return 'allow';
  if (isOpenPath(input.path)) return 'allow';
  if (input.hasValidInitData || input.hasValidAdmin) return 'allow';
  return 'deny';
}

export type MiniAppGateMode = 'off' | 'watch' | 'block';

/**
 * MINIAPP_ONLY 환경 변수.
 * - true/block/on: 막기 (서명 없는 공개 요청 403)
 * - false/off: 끄기 (로컬 개발)
 * - 비어 있음/watch: 지켜보기 — 막지 않고 서명 있음·없음 수만 센다(처음 켤 때 미니앱이 서명을 잘 보내는지 확인용)
 */
export function miniAppGateMode(raw: string | undefined): MiniAppGateMode {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'true' || v === 'block' || v === 'on' || v === '1' || v === 'yes')
    return 'block';
  if (v === 'false' || v === 'off' || v === '0' || v === 'no') return 'off';
  return 'watch';
}

/** 지켜보기·막기 중 센 수 (서버 메모리, 재시작하면 0) */
export const miniAppGateCounters = {
  since: new Date().toISOString(),
  signed: 0,
  admin: 0,
  unsigned: 0,
  blocked: 0,
  rateLimited: 0,
  /** 서명 없는 요청 최근 표본 (어디서 오는지 보려고, 개인정보 없이 경로·종류만) */
  unsignedSamples: [] as Array<{ at: string; path: string; client: string }>,
};

/** User-Agent 를 사람이 읽을 종류로만 줄인다 (원문은 저장하지 않음) */
export function describeClient(ua: string | undefined): string {
  const v = (ua ?? '').toLowerCase();
  if (!v) return '알 수 없음';
  if (
    /telegrambot|twitterbot|facebookexternalhit|slackbot|discordbot|kakaotalk-scrap/.test(
      v,
    )
  )
    return '링크 미리보기 봇';
  if (
    /bot|crawler|spider|curl|wget|python|axios|node-fetch|go-http|java\//.test(
      v,
    )
  )
    return '봇·스크립트';
  if (/telegram/.test(v)) return '텔레그램 앱 내 브라우저';
  if (/iphone|ipad/.test(v)) return '아이폰 브라우저';
  if (/android/.test(v)) return '안드로이드 브라우저';
  if (/windows|macintosh|linux/.test(v)) return 'PC 브라우저';
  return '기타';
}

export function noteUnsignedSample(path: string, ua: string | undefined) {
  const list = miniAppGateCounters.unsignedSamples;
  list.unshift({
    at: new Date().toISOString(),
    path: path
      .split('?')[0]
      .replace(/[0-9a-f-]{36}/gi, ':id')
      .slice(0, 80),
    client: describeClient(ua),
  });
  if (list.length > 30) list.length = 30;
}

/** 같은 사람(텔레그램 ID 또는 IP)이 1분에 이만큼 넘게 부르면 잠시 막는다 */
export const PUBLIC_RATE_LIMIT_PER_MIN = 180;

export class SlidingRateLimiter {
  private readonly hits = new Map<string, number[]>();
  constructor(
    private readonly limit = PUBLIC_RATE_LIMIT_PER_MIN,
    private readonly windowMs = 60_000,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const from = now - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > 50_000) this.sweep(from);
    return true;
  }

  private sweep(from: number) {
    for (const [k, list] of this.hits) {
      if (!list.some((t) => t > from)) this.hits.delete(k);
    }
  }
}
