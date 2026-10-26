/** 같은 새 카테고리 후보가 이만큼 모이면 어드민에 알린다 */
export const CATEGORY_SUGGESTION_ALERT_MIN = 5;

export type SuggestionRow = { name: string; count: number };

/** 알림 대상 후보(많은 순) */
export function suggestionsToAlert(
  rows: SuggestionRow[],
  min = CATEGORY_SUGGESTION_ALERT_MIN,
): SuggestionRow[] {
  return rows
    .filter((row) => row.count >= min)
    .sort((a, b) => b.count - a.count);
}

export function suggestionAlertKey(name: string): string {
  return `category-suggest:${name.replace(/\s+/g, '')}`;
}

/**
 * 분류 결과로 채널에 남길 후보 이름.
 * AI 결과일 때만 바꾼다(키워드 결과는 이전 값을 그대로 둔다 → undefined).
 */
export function nextSuggestedCategory(result: {
  source: 'ai' | 'fallback';
  newCategory?: string;
}): string | null | undefined {
  if (result.source !== 'ai') return undefined;
  return result.newCategory ?? null;
}
