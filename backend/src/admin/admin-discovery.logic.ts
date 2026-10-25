import type { DiscoveredUsernameResult } from '../stats/discovered-username.entity';

export const DISCOVERY_QUEUE_PAGE_SIZE = 50;
export const DISCOVERY_REGISTER_MAX = 100;

export type DiscoveryQueueFilter =
  | 'queued'
  | 'added'
  | 'not_korean'
  | 'too_small'
  | 'not_found'
  | 'invite_or_private'
  | 'already_registered'
  | 'all';

export const DISCOVERY_QUEUE_FILTERS: DiscoveryQueueFilter[] = [
  'queued',
  'added',
  'not_korean',
  'too_small',
  'not_found',
  'invite_or_private',
  'already_registered',
  'all',
];

export function parseDiscoveryQueueFilter(
  raw: string | undefined,
): DiscoveryQueueFilter {
  if (raw && DISCOVERY_QUEUE_FILTERS.includes(raw as DiscoveryQueueFilter)) {
    return raw as DiscoveryQueueFilter;
  }
  return 'queued';
}

export function discoveryResultLabel(
  result: DiscoveredUsernameResult | string | null,
): string {
  if (result === 'queued') return '대기';
  if (result === 'added') return '등록됨';
  if (result === 'not_korean') return '외국어';
  if (result === 'too_small') return '100명 미만';
  if (result === 'not_found') return '없는 채널';
  if (result === 'invite_or_private') return '초대·비공개';
  if (result === 'discarded') return '버림';
  if (result === 'already_registered') return '이미 등록';
  return result ?? '-';
}

export function discoverySourceLabel(source: string | null | undefined): string {
  if (source === 'snowball') return 'snowball';
  if (source === 'keyword') return 'keyword';
  if (source === 'linked') return '연결 대화방';
  return '기타';
}

export function assertDiscoveryUsernames(usernames: string[]): string[] {
  const unique = [
    ...new Set(
      usernames
        .map((name) => name.replace(/^@/, '').trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (unique.length === 0) {
    throw new Error('항목을 선택해 주세요.');
  }
  if (unique.length > DISCOVERY_REGISTER_MAX) {
    throw new Error(`한 번에 최대 ${DISCOVERY_REGISTER_MAX}개만 처리할 수 있습니다.`);
  }
  return unique;
}

export function discoveryQueueSkip(page: number, pageSize = DISCOVERY_QUEUE_PAGE_SIZE) {
  const safe = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  return { page: safe, skip: (safe - 1) * pageSize, take: pageSize };
}
