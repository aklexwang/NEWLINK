/** 방 이름 비교용: 이모지·공백·기호를 빼고 소문자로 */
export function normalizeTitleKey(title: string | null | undefined): string {
  return (title ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\p{S}\p{P}\s]/gu, '')
    .replace(/\u200d|\ufe0f/g, '')
    .trim();
}

/**
 * 이름이 같은 방은 순서상 먼저 나온 것(순위가 높은 것) 하나만 남긴다.
 * 이름이 비어 있으면 거르지 않는다.
 */
export function dedupeByTitle<T extends { title?: string | null }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeTitleKey(item.title);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
