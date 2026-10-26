import {
  PENDING_CATEGORY,
  resolveCategoryWithConfidence,
} from '../channels/auto-expose.logic';

/** AI 가 아닌 키워드 결과로는 이 신뢰도 이상일 때만 바꾸자고 한다 */
export const FALLBACK_CHANGE_CONFIDENCE = 0.7;

export type ReclassifyRowStatus = 'same' | 'pending' | 'applied' | 'skipped';

export type ReclassifyDecision = {
  after: string;
  confidence: number;
  changed: boolean;
};

/**
 * 전체 재분류 한 채널의 제안.
 * - 신뢰도가 낮으면 이미 정해진 카테고리를 분류대기로 내리지 않고 그대로 둔다
 * - AI 를 못 쓴 키워드 결과는 확실할 때만 바꾸자고 한다
 */
export function decideReclassify(input: {
  before: string;
  category: string;
  confidence: number;
  source: 'ai' | 'fallback';
}): ReclassifyDecision {
  const before = (input.before ?? '').trim() || PENDING_CATEGORY;
  const keep = { after: before, confidence: input.confidence, changed: false };
  if (input.source !== 'ai' && input.confidence < FALLBACK_CHANGE_CONFIDENCE) {
    return keep;
  }
  const resolved = resolveCategoryWithConfidence(
    input.category,
    input.confidence,
  );
  if (resolved.pending && before !== PENDING_CATEGORY) return keep;
  return {
    after: resolved.category,
    confidence: input.confidence,
    changed: resolved.category !== before,
  };
}

export type TransitionCount = { from: string; to: string; count: number };

/** 전 → 후 묶음별 개수, 많은 순 */
export function countTransitions(
  rows: Array<{ beforeCategory: string; afterCategory: string }>,
): TransitionCount[] {
  const map = new Map<string, TransitionCount>();
  for (const row of rows) {
    const key = `${row.beforeCategory}\u0000${row.afterCategory}`;
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else
      map.set(key, {
        from: row.beforeCategory,
        to: row.afterCategory,
        count: 1,
      });
  }
  return [...map.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
  );
}
