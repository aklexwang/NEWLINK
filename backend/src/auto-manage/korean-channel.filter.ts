import {
  hasHangul,
  isPlaceholderContactTitle,
} from '../channels/channel-language.logic';

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
  if (isPlaceholderContactTitle(t)) return false;
  return hasHangul(t) || hasHangul(d);
}
