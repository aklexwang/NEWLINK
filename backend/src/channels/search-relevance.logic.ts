/**
 * 회원 검색 결과 순서. 친 글자와 얼마나 맞는지로 먼저 정렬한다.
 * 제목이 그 글자로 시작 > 제목에 포함 > 아이디에 포함 > 소개글에 포함 > 동의어·카테고리로만 걸림
 */
export type RelevanceInput = {
  title?: string | null;
  username?: string | null;
  link?: string | null;
  description?: string | null;
};

export function searchRelevance(item: RelevanceInput, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const title = (item.title ?? '').toLowerCase();
  const handle = (item.username ?? '').replace(/^@/, '').toLowerCase();
  const link = (item.link ?? '').toLowerCase();
  const description = (item.description ?? '').toLowerCase();
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 80;
  if (handle.includes(q) || link.includes(q)) return 60;
  if (description.includes(q)) return 30;
  return 10;
}
