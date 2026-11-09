/** 회원 사이트·커스텀 도메인만 CORS 허용 (서버 API 는 onrender, 화면은 pages.dev 라서 교차 출처) */
export const DEFAULT_CORS_ORIGINS = [
  'https://newlink-bez.pages.dev',
  'https://global-spay.com',
  'https://www.global-spay.com',
];

/** Cloudflare Pages 미리보기 배포: <해시/브랜치>.newlink-bez.pages.dev */
const PREVIEW_HOST = /^https:\/\/[a-z0-9-]+\.newlink-bez\.pages\.dev$/i;

export function parseCorsOrigins(raw: string | undefined): Set<string> {
  const extra = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_CORS_ORIGINS, ...extra]);
}

/**
 * 브라우저가 아닌 요청(Origin 헤더 없음)은 통과시킨다(서버 간 호출·헬스체크).
 * 그 외에는 허용 목록·미리보기 배포만 통과.
 */
export function isCorsOriginAllowed(
  origin: string | undefined,
  allowList: Set<string>,
): boolean {
  if (!origin) return true;
  if (allowList.has(origin)) return true;
  return PREVIEW_HOST.test(origin);
}
