/** 한글(완성형·자모) 포함 여부 */
const HANGUL_RE = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/;

/** 비어 있거나 텔레그램 미존재/연락처 페이지만 있는 제목 */
const INVALID_TITLE_RE =
  /^(telegram\s*:?\s*contact|contact\s*@|undefined|null)$/i;

/**
 * 한국 채널로 볼지 판별.
 * - 제목(또는 설명)에 한글이 있으면 통과
 * - Contact 페이지만 있으면 제외
 */
export function isKoreanChannelText(
  title?: string | null,
  description?: string | null,
): boolean {
  const t = (title ?? '').trim();
  const d = (description ?? '').trim();
  if (!t && !d) return false;
  if (INVALID_TITLE_RE.test(t)) return false;
  if (/^telegram:\s*contact@/i.test(t)) return false;
  return HANGUL_RE.test(t) || HANGUL_RE.test(d);
}
