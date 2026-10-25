/**
 * 같은 링크 중복 판단. 회원 제보·승인·어드민 등록·대량 등록·발견·자동 관리가 모두 이 규칙을 쓴다.
 * - 공개 링크: username 기준(대소문자 무시)
 * - 초대 링크(+해시 / joinchat): 해시 기준(대소문자 구분)
 * - 합쳐진(merged) 행은 비교하지 않는다
 */
import {
  extractInviteHash,
  linkIdentityKey,
  normalizeTelegramLink,
} from './channel-link.logic';
import { extractTelegramUsernameFromLink } from './telegram-username';

export type DuplicateKind = 'active' | 'pending' | 'rejected';

export interface DuplicateRow {
  id: string;
  link: string;
  username?: string | null;
  status: string;
  collectStatus?: string | null;
  createdAt?: Date | string | null;
}

export interface DuplicateMatch<T extends DuplicateRow = DuplicateRow> {
  kind: DuplicateKind;
  channel: T;
}

/** 회원에게 보여 줄 문구 */
export const DUPLICATE_ACTIVE_OR_PENDING_MESSAGE =
  '이미 등록되었거나 심사 중인 채널입니다';
export const DUPLICATE_REJECTED_MESSAGE = '이미 검토된 링크입니다';
/** 어드민이 거절된 행을 다시 활성화할지 물어야 할 때 쓰는 오류 코드 */
export const DUPLICATE_REJECTED_CODE = 'DUPLICATE_REJECTED';

const KIND_ORDER: Record<DuplicateKind, number> = {
  active: 0,
  pending: 1,
  rejected: 2,
};

function kindOf(status: string): DuplicateKind | null {
  if (status === 'active') return 'active';
  if (status === 'pending') return 'pending';
  if (status === 'rejected') return 'rejected';
  return null;
}

function createdAtOf(row: DuplicateRow): number {
  if (row.createdAt == null) return 0;
  const at = new Date(row.createdAt).getTime();
  return Number.isFinite(at) ? at : 0;
}

/**
 * 링크 키가 같거나, 공개 링크일 때 수집으로 채워진 username 이 같으면 같은 대상이다.
 * (초대 링크로 등록된 방이 나중에 공개 username 을 얻은 경우를 잡는다)
 */
function sameTarget(row: DuplicateRow, key: string): boolean {
  if (linkIdentityKey(row.link) === key) return true;
  if (!key.startsWith('u:')) return false;
  const username = (row.username ?? '').replace(/^@/, '').trim().toLowerCase();
  return username !== '' && `u:${username}` === key;
}

/**
 * 후보 행에서 같은 링크를 찾아 가장 우선인 1건을 돌려준다.
 * 여러 건이면 ACTIVE > PENDING > REJECTED, 같은 상태면 먼저 만들어진 행.
 */
export function pickDuplicate<T extends DuplicateRow>(
  rows: T[],
  link: string,
  excludeId?: string,
): DuplicateMatch<T> | null {
  const key = linkIdentityKey(link);
  const matches: Array<DuplicateMatch<T>> = [];
  for (const row of rows) {
    if (excludeId && row.id === excludeId) continue;
    if (row.collectStatus === 'merged') continue;
    const kind = kindOf(row.status);
    if (!kind) continue;
    if (!sameTarget(row, key)) continue;
    matches.push({ kind, channel: row });
  }
  if (matches.length === 0) return null;
  matches.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      createdAtOf(a.channel) - createdAtOf(b.channel),
  );
  return matches[0];
}

/**
 * DB 에서 후보를 좁힐 때 쓰는 검색어(소문자). 정확한 비교는 pickDuplicate 가 한다.
 * 공개 링크는 username, 초대 링크는 해시, 그 외는 정규화한 링크.
 */
export function duplicateSearchTerm(link: string): string {
  const normalized = normalizeTelegramLink(link);
  const hash = extractInviteHash(normalized);
  if (hash) return hash.toLowerCase();
  const username = extractTelegramUsernameFromLink(normalized);
  if (username) return username;
  return normalized.toLowerCase();
}
