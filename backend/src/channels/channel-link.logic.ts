/** 텔레그램 링크 정규화·중복 판별. 회원 목록과 대시보드가 같은 규칙을 쓰도록 순수 함수로 둔다. */

export function normalizeTelegramLink(link: string): string {
  const trimmed = link.trim();
  if (trimmed.startsWith('http')) return trimmed.replace(/\/$/, '');
  if (trimmed.startsWith('t.me/')) return `https://${trimmed.replace(/\/$/, '')}`;
  if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`;
  if (trimmed.startsWith('+')) return `https://t.me/${trimmed}`;
  return `https://t.me/${trimmed}`;
}

export function channelLinkKey(link: string): string {
  return normalizeTelegramLink(link).toLowerCase();
}

export type DuplicateCandidate = {
  link: string;
  isPromoted?: boolean | null;
  recommendCount?: number | null;
  memberCount?: number | null;
  avatarApproved?: boolean | null;
  updatedAt?: Date | string | null;
};

function timeOf(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  const at = new Date(value).getTime();
  return Number.isFinite(at) ? at : 0;
}

/** 같은 링크가 둘 이상일 때 대표를 바꿀지. 광고 > 추천 수 > 인원 > 로고 승인 > 최근 수정 순 */
export function shouldReplaceDuplicate(
  existing: DuplicateCandidate,
  candidate: DuplicateCandidate,
): boolean {
  const candidatePromoted = Boolean(candidate.isPromoted);
  if (candidatePromoted !== Boolean(existing.isPromoted)) return candidatePromoted;
  const candidateRecommend = candidate.recommendCount ?? 0;
  const existingRecommend = existing.recommendCount ?? 0;
  if (candidateRecommend !== existingRecommend) {
    return candidateRecommend > existingRecommend;
  }
  const candidateMembers = candidate.memberCount ?? 0;
  const existingMembers = existing.memberCount ?? 0;
  if (candidateMembers !== existingMembers) {
    return candidateMembers > existingMembers;
  }
  const candidateAvatar = Boolean(candidate.avatarApproved);
  if (candidateAvatar !== Boolean(existing.avatarApproved)) return candidateAvatar;
  return timeOf(candidate.updatedAt) > timeOf(existing.updatedAt);
}

/** 같은 링크는 대표 1개만 남긴다. 입력 순서가 같으면 결과도 같다 */
export function dedupeChannelsByLink<T extends DuplicateCandidate>(
  channels: T[],
): T[] {
  const byLink = new Map<string, T>();
  for (const channel of channels) {
    const key = channelLinkKey(channel.link);
    const existing = byLink.get(key);
    if (!existing || shouldReplaceDuplicate(existing, channel)) {
      byLink.set(key, channel);
    }
  }
  return [...byLink.values()];
}
