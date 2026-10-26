import { MTPROTO_MIN_GAP_MS } from './mtproto-collect.logic';

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
        : String(raw).trim();
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
  return method === 'contacts.ResolveUsername' || method === 'contacts.Search';
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
