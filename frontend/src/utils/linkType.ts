import type { LinkType } from '../types/channel';

export function linkTypeLabel(linkType: LinkType | undefined | null): string {
  return linkType === 'group' ? '그룹' : '채널';
}

export function linkTypeBadgeClass(linkType: LinkType | undefined | null): string {
  return linkType === 'group'
    ? 'bg-violet-100 text-violet-800'
    : 'bg-sky-100 text-sky-800';
}

export function submissionStatusLabel(status: 'pending' | 'active' | 'rejected'): string {
  if (status === 'active') return '노출 중';
  if (status === 'rejected') return '거절됨';
  return '승인 대기';
}
