/** 텔레그램 링크 정규화·중복 판별. 회원 목록과 대시보드가 같은 규칙을 쓰도록 순수 함수로 둔다. */
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from './telegram-username';

export function normalizeTelegramLink(link: string): string {
  const trimmed = link.trim();
  if (trimmed.startsWith('http')) return trimmed.replace(/\/$/, '');
  if (trimmed.startsWith('t.me/'))
    return `https://${trimmed.replace(/\/$/, '')}`;
  if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`;
  if (trimmed.startsWith('+')) return `https://t.me/${trimmed}`;
  return `https://t.me/${trimmed}`;
}

export function channelLinkKey(link: string): string {
  return normalizeTelegramLink(link).toLowerCase();
}

/** 초대 링크(t.me/+해시, joinchat/해시)의 해시. 대소문자를 그대로 둔다 */
export function extractInviteHash(
  link: string | null | undefined,
): string | null {
  if (!link?.trim() || !isInviteOnlyLink(link)) return null;
  const match = link
    .trim()
    .match(
      /(?:t\.me|telegram\.me|telegram\.dog)\/(?:\+|joinchat\/)([A-Za-z0-9_-]+)/i,
    );
  return match ? match[1] : null;
}

/**
 * 같은 대상인지 비교하는 키.
 * 공개 링크는 username(대소문자 무시), 초대 링크는 해시(대소문자 구분), 나머지는 소문자 링크.
 */
export function linkIdentityKey(link: string): string {
  const normalized = normalizeTelegramLink(link);
  const hash = extractInviteHash(normalized);
  if (hash) return `i:${hash}`;
  const username = extractTelegramUsernameFromLink(normalized);
  if (username) return `u:${username}`;
  return `l:${normalized.toLowerCase()}`;
}

export type DuplicateCandidate = {
  link: string;
  status?: string | null;
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

/** status 가 없는 행은 승인된 행으로 본다(집계용 부분 행) */
function isActiveStatus(status: string | null | undefined): boolean {
  return !status || status === 'active';
}

/**
 * 같은 링크가 둘 이상일 때 대표를 바꿀지.
 * 승인(ACTIVE) > 광고 > 추천 수 > 인원 > 로고 승인 > 최근 수정 순
 */
export function shouldReplaceDuplicate(
  existing: DuplicateCandidate,
  candidate: DuplicateCandidate,
): boolean {
  const candidateActive = isActiveStatus(candidate.status);
  if (candidateActive !== isActiveStatus(existing.status))
    return candidateActive;
  const candidatePromoted = Boolean(candidate.isPromoted);
  if (candidatePromoted !== Boolean(existing.isPromoted))
    return candidatePromoted;
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
  if (candidateAvatar !== Boolean(existing.avatarApproved))
    return candidateAvatar;
  return timeOf(candidate.updatedAt) > timeOf(existing.updatedAt);
}

export type DedupeOptions<T> = {
  /** true 인 행을 먼저 대표로 고른다(예: 회원에게 노출되는 행) */
  prefer?: (channel: T) => boolean;
};

/**
 * 같은 링크는 "가장 좋은 행" 1개만 남긴다. 입력 순서가 같으면 결과도 같다.
 * 회원 화면·사이트맵·대시보드가 모두 이 함수 하나를 쓴다.
 */
export function dedupeChannelsByLink<T extends DuplicateCandidate>(
  channels: T[],
  options?: DedupeOptions<T>,
): T[] {
  const prefer = options?.prefer;
  const byLink = new Map<string, T>();
  for (const channel of channels) {
    const key = linkIdentityKey(channel.link);
    const existing = byLink.get(key);
    if (!existing) {
      byLink.set(key, channel);
      continue;
    }
    if (prefer) {
      const candidatePreferred = prefer(channel);
      const existingPreferred = prefer(existing);
      if (candidatePreferred !== existingPreferred) {
        if (candidatePreferred) byLink.set(key, channel);
        continue;
      }
    }
    if (shouldReplaceDuplicate(existing, channel)) {
      byLink.set(key, channel);
    }
  }
  return [...byLink.values()];
}
