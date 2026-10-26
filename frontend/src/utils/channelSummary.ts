// 검색 결과 카드 요약. Node 테스트로도 돌릴 수 있게 다른 파일을 가져오지 않는다.

export type ChannelContact = { label: string | null; handle: string };

const HANDLE_RE = /@([A-Za-z][A-Za-z0-9_]{3,31})/g;
/** 아이디 바로 앞의 짧은 이름(고객센터, 문의, 운영자 등)만 이름으로 쓴다 */
const LABEL_RE = /([가-힣A-Za-z]{1,8})\s*[:：]?\s*$/;

/**
 * 소개글에서 연락처 아이디를 뽑는다. "고객센터 @newtoki24" → { label: '고객센터', handle: 'newtoki24' }
 * 채널 자기 아이디는 뺀다. 최대 3개.
 */
export function extractContacts(
  description: string | null | undefined,
  ownUsername?: string | null,
): ChannelContact[] {
  const text = description ?? '';
  const own = (ownUsername ?? '').replace(/^@/, '').toLowerCase();
  const seen = new Set<string>();
  const result: ChannelContact[] = [];
  for (const match of text.matchAll(HANDLE_RE)) {
    const handle = match[1];
    const key = handle.toLowerCase();
    if (key === own || seen.has(key)) continue;
    // 이메일(abc@def.com)의 @ 는 아이디가 아니다
    const prevChar = text[(match.index ?? 0) - 1] ?? '';
    if (/[A-Za-z0-9._%+-]/.test(prevChar)) continue;
    seen.add(key);
    const lineStart = text.lastIndexOf('\n', match.index ?? 0) + 1;
    const before = text.slice(lineStart, match.index ?? 0);
    const label = before.match(LABEL_RE)?.[1] ?? null;
    result.push({ label, handle });
    if (result.length >= 3) break;
  }
  return result;
}

/** "2026년 04월 28일" (한국 시간) */
export function formatKoDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}년 ${mm}월 ${dd}일`;
}

/** "2026년 4월 · 약 5개월" */
export function formatSince(iso: string | null | undefined, now = Date.now()): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const head = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월`;
  const days = Math.floor((now - t) / 86_400_000);
  if (days < 1) return `${head} · 오늘`;
  if (days < 30) return `${head} · ${days}일`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${head} · 약 ${months}개월`;
  return `${head} · 약 ${Math.floor(months / 12)}년`;
}

/** 수집한 날 수로 본 데이터 믿을 만한 정도 */
export function dataReliability(observedDays: number | null | undefined): string {
  if (observedDays == null || !Number.isFinite(observedDays)) return '집계 전';
  if (observedDays < 7) return `부족 (수집 ${Math.max(1, Math.floor(observedDays))}일째)`;
  if (observedDays < 30) return '보통';
  return '충분';
}
