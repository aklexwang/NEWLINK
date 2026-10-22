/** 같은 username 묶음에서 남길 채널을 고를 때 쓰는 값 */
export type DuplicateKeepCandidate = {
  id: string;
  title: string;
  isVerified: boolean;
  isPromoted: boolean;
  favoriteCount: number;
  recommendCount: number;
  postCount: number;
  createdAt: Date;
};

function asTime(value: Date): number {
  const t = value.getTime();
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
}

/** 즐겨찾기 + 추천 수 */
export function engagementCount(channel: DuplicateKeepCandidate): number {
  return channel.favoriteCount + channel.recommendCount;
}

/**
 * 우선순위: 인증 > 광고 중 > 즐겨찾기·추천 > 게시글 수 > 먼저 등록.
 * 음수면 a 를 남긴다.
 */
export function compareDuplicateKeepPriority(
  a: DuplicateKeepCandidate,
  b: DuplicateKeepCandidate,
): number {
  if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
  if (a.isPromoted !== b.isPromoted) return a.isPromoted ? -1 : 1;
  const eng = engagementCount(b) - engagementCount(a);
  if (eng !== 0) return eng;
  if (a.postCount !== b.postCount) return b.postCount - a.postCount;
  const created = asTime(a.createdAt) - asTime(b.createdAt);
  if (created !== 0) return created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function pickKeepChannel(
  channels: DuplicateKeepCandidate[],
): DuplicateKeepCandidate {
  if (channels.length === 0) {
    throw new Error('남길 채널 후보가 없습니다.');
  }
  return [...channels].sort(compareDuplicateKeepPriority)[0];
}

export function normalizeDuplicateUsername(
  value: string | null | undefined,
): string | null {
  const u = value?.replace(/^@/, '').trim().toLowerCase() ?? '';
  return u || null;
}

export const ALREADY_REGISTERED_CHANNEL = '이미 등록된 채널입니다.';
