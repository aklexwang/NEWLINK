import {
  hasDistinctForeignScript,
  hasHangul,
} from '../channels/channel-language.logic';
import { AUTO_EXPOSE_MIN_MEMBERS } from '../channels/auto-expose.logic';
import { telegramTlClassName } from './mtproto-collect.logic';

export type PublicSearchHit = {
  username: string;
  title: string;
  linkType: 'channel' | 'group';
  memberCount: number | null;
};

function classNameOf(raw: unknown): string {
  return telegramTlClassName(raw).toLowerCase();
}

/** 사용자 계정·개인 프로필은 검색 결과에 넣지 않습니다. */
export function isContactsSearchUser(raw: unknown): boolean {
  const name = classNameOf(raw);
  if (!name) return false;
  return (
    name === 'user' ||
    name === 'userempty' ||
    name === 'peeruser' ||
    name.endsWith('.user')
  );
}

export function isPublicSearchChannel(raw: unknown): boolean {
  const name = classNameOf(raw);
  return name === 'channel' || name.endsWith('.channel');
}

function usernameOf(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { username?: unknown };
  if (typeof rec.username !== 'string') return null;
  const u = rec.username.replace(/^@/, '').trim().toLowerCase();
  return u || null;
}

function titleOf(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== 'object') return fallback;
  const rec = raw as { title?: unknown };
  if (typeof rec.title === 'string' && rec.title.trim()) return rec.title.trim();
  return fallback;
}

function linkTypeOf(raw: unknown): 'channel' | 'group' {
  if (!raw || typeof raw !== 'object') return 'channel';
  const rec = raw as { megagroup?: unknown; broadcast?: unknown };
  if (rec.megagroup && !rec.broadcast) return 'group';
  return 'channel';
}

function memberCountOf(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { participantsCount?: unknown };
  const n = Number(rec.participantsCount);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * contacts.Search 에 이미 있는 정보만으로 거릅니다. 추가 요청 없음.
 * 인원 100명 미만, 제목에 한글이 없고 영문·한글 외 문자가 뚜렷하면 버립니다.
 */
export function shouldKeepKeywordSearchHit(hit: {
  title: string;
  memberCount: number | null;
}): boolean {
  if (hit.memberCount != null && hit.memberCount < AUTO_EXPOSE_MIN_MEMBERS) {
    return false;
  }
  const title = (hit.title ?? '').trim();
  if (hasHangul(title)) return true;
  if (hasDistinctForeignScript(title)) return false;
  return true;
}

/**
 * contacts.Search 응답에서 공개 채널·공개 그룹 username 만 뽑습니다.
 * users 배열과 User/PeerUser 는 버립니다. 가입하지 않습니다.
 */
export function publicUsernamesFromContactsSearch(payload: {
  chats?: unknown[];
  users?: unknown[];
}): PublicSearchHit[] {
  const hits: PublicSearchHit[] = [];
  const seen = new Set<string>();
  for (const chat of payload.chats ?? []) {
    if (isContactsSearchUser(chat)) continue;
    if (!isPublicSearchChannel(chat)) continue;
    const username = usernameOf(chat);
    if (!username || seen.has(username)) continue;
    seen.add(username);
    const hit: PublicSearchHit = {
      username,
      title: titleOf(chat, username),
      linkType: linkTypeOf(chat),
      memberCount: memberCountOf(chat),
    };
    if (!shouldKeepKeywordSearchHit(hit)) continue;
    hits.push(hit);
  }
  return hits;
}
