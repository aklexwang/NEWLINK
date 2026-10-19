const COMPARE_KEY = 'newlink_compare_ids';
const COMPARE_MAX = 3;

export function getCompareIds(): string[] {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, COMPARE_MAX);
  } catch {
    return [];
  }
}

export function addCompareId(id: string): { ids: string[]; added: boolean; message: string } {
  const ids = getCompareIds();
  if (ids.includes(id)) {
    return { ids, added: false, message: '이미 비교 목록에 있습니다.' };
  }
  if (ids.length >= COMPARE_MAX) {
    return { ids, added: false, message: '비교는 최대 3개까지입니다.' };
  }
  const next = [...ids, id];
  localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
  return { ids: next, added: true, message: `비교에 추가했습니다. (${next.length}/${COMPARE_MAX})` };
}

export function removeCompareId(id: string): string[] {
  const next = getCompareIds().filter((item) => item !== id);
  localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
  return next;
}

export function setCompareIds(ids: string[]): string[] {
  const next = [...new Set(ids)].slice(0, COMPARE_MAX);
  localStorage.setItem(COMPARE_KEY, JSON.stringify(next));
  return next;
}

export { COMPARE_MAX };
