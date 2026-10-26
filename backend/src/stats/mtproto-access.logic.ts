import { MTPROTO_MIN_GAP_MS } from './mtproto-collect.logic';
import { asText } from '../common/as-text';

export const RESOLVE_DAILY_LIMIT_DEFAULT = 50;
export const MTPROTO_RESOLVE_SEARCH_GAP_MS = 10_000;

const INVALID_STORED_ACCESS_CODES = new Set([
  'CHANNEL_INVALID',
  'CHANNEL_PRIVATE',
  'CHAT_ID_INVALID',
  'PEER_ID_INVALID',
  'USERNAME_INVALID',
]);

export function serializeAccessHash(raw: unknown): string | null {
  if (raw == null) return null;
  const text =
    typeof raw === 'bigint'
      ? raw.toString(10)
      : typeof raw === 'number' && Number.isFinite(raw)
        ? String(Math.trunc(raw))
        : asText(raw).trim();
  if (!/^-?\d+$/.test(text)) return null;
  return text;
}

export function canReuseStoredAccess(channel: {
  telegramChatId?: number | null;
  telegramAccessHash?: string | null;
}): boolean {
  if (
    channel.telegramChatId == null ||
    !Number.isFinite(channel.telegramChatId)
  ) {
    return false;
  }
  return serializeAccessHash(channel.telegramAccessHash) != null;
}

export function isStoredAccessInvalid(
  code: string | null | undefined,
): boolean {
  return INVALID_STORED_ACCESS_CODES.has((code ?? '').trim());
}

export function canSpendResolve(
  usedToday: number,
  limit = RESOLVE_DAILY_LIMIT_DEFAULT,
): boolean {
  return usedToday < limit;
}

export function isResolveOrSearchMethod(method: string): boolean {
  return (
    method === 'contacts.ResolveUsername' ||
    method === 'contacts.Search' ||
    // 초대 링크 확인도 찾기와 같은 무게로 아껴 쓴다
    method === 'messages.CheckChatInvite'
  );
}

/**
 * CheckChatInvite 결과에서 "이미 회원인 방"만 꺼낸다(가입은 하지 않는다).
 * ChatInviteAlready / ChatInvitePeek → chat, ChatInvite(회원 아님) → null
 */
export function memberChatFromInvite(result: unknown): {
  id: unknown;
  accessHash: unknown;
  title?: string;
  date?: number;
  megagroup?: boolean;
  broadcast?: boolean;
} | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as { className?: string; chat?: Record<string, unknown> };
  if (r.className !== 'ChatInviteAlready' && r.className !== 'ChatInvitePeek')
    return null;
  const chat = r.chat;
  if (
    !chat ||
    chat.className !== 'Channel' ||
    chat.accessHash == null ||
    chat.id == null
  ) {
    return null;
  }
  return {
    id: chat.id,
    accessHash: chat.accessHash,
    title: typeof chat.title === 'string' ? chat.title : undefined,
    date: typeof chat.date === 'number' ? chat.date : undefined,
    megagroup: chat.megagroup === true,
    broadcast: chat.broadcast === true,
  };
}

export function mtprotoCallGapMs(input: {
  method: string;
  lastCallAt: number;
  lastResolveOrSearchAt: number;
  now?: number;
}): number {
  const now = input.now ?? Date.now();
  const minGap = Math.max(0, MTPROTO_MIN_GAP_MS - (now - input.lastCallAt));
  if (!isResolveOrSearchMethod(input.method)) return minGap;
  const sensitiveGap = Math.max(
    0,
    MTPROTO_RESOLVE_SEARCH_GAP_MS - (now - input.lastResolveOrSearchAt),
  );
  return Math.max(minGap, sensitiveGap);
}

export function floodWaitUntilFromSeconds(
  startedAt: Date,
  seconds: number,
): Date {
  return new Date(startedAt.getTime() + Math.max(0, seconds) * 1000);
}

export function isFloodWaitBlocking(
  until: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (until == null) return false;
  const at = until instanceof Date ? until : new Date(until);
  if (Number.isNaN(at.getTime())) return false;
  return at.getTime() > now.getTime();
}
