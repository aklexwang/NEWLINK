import type { ChannelLanguage } from './channel.entity';

/** 자동 노출에 필요한 최소 구독자·인원 */
export const AUTO_EXPOSE_MIN_MEMBERS = 100;

/** 이 값 미만이면 분류대기로 둔다 */
export const CATEGORY_CONFIDENCE_MIN = 0.7;

/** 자동 분류가 확실하지 않을 때 쓰는 카테고리 */
export const PENDING_CATEGORY = '분류대기';

export const ADULT_CATEGORY = '성인';

export type AutoExposeKind = 'channel' | 'group' | 'invalid' | 'unknown';

export type AutoExposeCheckInput = {
  kind: AutoExposeKind;
  language: ChannelLanguage;
  memberCount: number | null;
  hasActiveUsername: boolean;
};

export type AutoExposeCheck = {
  ok: boolean;
  reason: string;
};

/** 승인 없이 바로 노출할 수 있는지 */
export function canAutoExpose(input: AutoExposeCheckInput): AutoExposeCheck {
  if (input.kind === 'invalid') {
    return { ok: false, reason: 'invalid' };
  }
  if (input.language !== 'ko') {
    return { ok: false, reason: 'language' };
  }
  if (input.hasActiveUsername) {
    return { ok: false, reason: 'duplicate_username' };
  }
  if (
    input.memberCount == null ||
    input.memberCount < AUTO_EXPOSE_MIN_MEMBERS
  ) {
    return { ok: false, reason: 'members' };
  }
  return { ok: true, reason: 'ok' };
}

/** 신뢰도가 낮으면 분류대기, 아니면 AI가 고른 이름 */
export function resolveCategoryWithConfidence(
  category: string,
  confidence: number,
  minConfidence = CATEGORY_CONFIDENCE_MIN,
): { category: string; pending: boolean } {
  const name = category.trim() || PENDING_CATEGORY;
  if (confidence < minConfidence) {
    return { category: PENDING_CATEGORY, pending: true };
  }
  return { category: name, pending: false };
}

export function isAdultCategory(name: string | null | undefined): boolean {
  return (name ?? '').trim() === ADULT_CATEGORY;
}

export function isPendingCategory(name: string | null | undefined): boolean {
  return (name ?? '').trim() === PENDING_CATEGORY;
}

export function isWeeklyReclassifyTarget(channel: {
  status?: string | null;
  category?: string | null;
  categoryLocked?: boolean | null;
}): boolean {
  return (
    channel.status === 'active' &&
    isPendingCategory(channel.category) &&
    channel.categoryLocked !== true
  );
}

/** 홈·피드·랭킹 기본값에서 성인을 뺄지. 성인 카테고리를 고르면 남긴다. */
export function allowAdultInList(
  category: string | null | undefined,
  selectedCategory?: string | null,
): boolean {
  if (!isAdultCategory(category)) return true;
  return selectedCategory === ADULT_CATEGORY;
}

export function isChannelListed(channel: {
  isVisible?: boolean | null;
}): boolean {
  return channel.isVisible !== false;
}
