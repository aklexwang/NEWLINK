/** 공개 채널·그룹만 MTProto 로 읽을 때 쓰는 규칙. 가입·참여자 조회는 여기서 막습니다. */

export const MTPROTO_MIN_GAP_MS = 1_500;
export const MTPROTO_DEFAULT_DAILY_LIMIT = 3_000;
export const MTPROTO_HISTORY_LIMIT = 50;
export const MTPROTO_EXCERPT_MAX = 200;

/** 수집기가 호출해도 되는 TL 메서드만 */
export const MTPROTO_ALLOWED_METHODS = [
  'contacts.ResolveUsername',
  'channels.GetFullChannel',
  'messages.GetHistory',
] as const;

/** 어떤 경로로도 호출하면 안 되는 메서드 */
export const MTPROTO_FORBIDDEN_METHODS = [
  'channels.JoinChannel',
  'messages.ImportChatInvite',
  'messages.CheckChatInvite',
  'channels.GetParticipants',
  'channels.GetParticipant',
  'contacts.GetContacts',
  'users.GetFullUser',
  'users.GetUsers',
] as const;

const AUTH_FATAL_CODES = [
  'AUTH_KEY_UNREGISTERED',
  'AUTH_KEY_INVALID',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'USER_DEACTIVATED',
  'USER_DEACTIVATED_BAN',
  'PHONE_NUMBER_BANNED',
  'USER_RESTRICTED',
];

export function isMtprotoMethodAllowed(method: string): boolean {
  const name = normalizeMethodName(method);
  if (
    (MTPROTO_FORBIDDEN_METHODS as readonly string[]).includes(name)
  ) {
    return false;
  }
  return (MTPROTO_ALLOWED_METHODS as readonly string[]).includes(name);
}

export function assertMtprotoMethodAllowed(method: string): void {
  if (!isMtprotoMethodAllowed(method)) {
    throw new Error('mtproto:forbidden_method');
  }
}

export function normalizeMethodName(method: string): string {
  return method.replace(/^Api\./, '').trim();
}

export function canSpendMtprotoRequest(
  usedToday: number,
  limit = MTPROTO_DEFAULT_DAILY_LIMIT,
): boolean {
  return usedToday < limit;
}

/** FloodWait 초 → 밀리초. 해당 없으면 null */
export function floodWaitMs(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    const text = String(error ?? '');
    const match = text.match(/FLOOD_WAIT[_:]?(\d+)/i);
    return match ? Number(match[1]) * 1000 : null;
  }
  const record = error as {
    seconds?: unknown;
    errorMessage?: unknown;
    message?: unknown;
  };
  if (typeof record.seconds === 'number' && Number.isFinite(record.seconds)) {
    return Math.max(0, record.seconds) * 1000;
  }
  const text = `${record.errorMessage ?? ''} ${record.message ?? ''}`;
  const match = text.match(/FLOOD_WAIT[_:]?(\d+)/i);
  return match ? Number(match[1]) * 1000 : null;
}

export async function retryAfterFloodWait<T>(
  run: () => Promise<T>,
  sleepFn: (ms: number) => Promise<void>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const wait = floodWaitMs(error);
    if (wait == null) throw error;
    await sleepFn(wait);
    return run();
  }
}

export function isMtprotoAuthFatal(error: unknown): boolean {
  const code = mtprotoErrorCode(error);
  return AUTH_FATAL_CODES.includes(code);
}

/** 세션 문자열이 섞이지 않게 코드만 뽑습니다. */
export function mtprotoErrorCode(error: unknown): string {
  const text =
    error && typeof error === 'object' && 'errorMessage' in error
      ? String((error as { errorMessage?: unknown }).errorMessage ?? '')
      : error instanceof Error
        ? error.message
        : String(error ?? '');
  const match = text.match(/\b([A-Z][A-Z0-9_]{5,})\b/);
  return match?.[1] ?? 'mtproto_error';
}

/**
 * 이번에 가져온 글 번호 구간 안에서, 예전에는 있었는데 빠진 번호를 삭제된 글로 봅니다.
 * 구간 밖(더 오래된 글)은 건드리지 않습니다.
 */
export function deletedMessageIds(
  previouslySeen: number[],
  fetched: number[],
): number[] {
  if (fetched.length === 0) return [];
  let min = fetched[0];
  let max = fetched[0];
  const fetchedSet = new Set<number>();
  for (const id of fetched) {
    fetchedSet.add(id);
    if (id < min) min = id;
    if (id > max) max = id;
  }
  const missing: number[] = [];
  for (const id of previouslySeen) {
    if (id >= min && id <= max && !fetchedSet.has(id)) missing.push(id);
  }
  return missing;
}

export function unixSecondsToDate(value: number | null | undefined): Date | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000);
}

export const GROUP_ACTIVITY_DAY_MS = 24 * 60 * 60 * 1000;
export const GROUP_ACTIVITY_WEEK_MS = 7 * GROUP_ACTIVITY_DAY_MS;

export type GroupActivityCounts = {
  activity24h: number;
  activity7d: number;
};

/**
 * 그룹 GetHistory 항목에서 게시 시각(ms)만 뽑습니다.
 * 본문·보낸 사람·전달 출처·엔티티는 읽지 않습니다.
 */
export function groupMessagePostedAtMs(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as { className?: string; date?: number };
  if (msg.className && msg.className !== 'Message') return null;
  const postedAt = unixSecondsToDate(msg.date);
  return postedAt ? postedAt.getTime() : null;
}

/** 시각 목록만 세고, 호출 쪽에서 원본 메시지는 버려야 합니다. */
export function countGroupActivityFromDates(
  postedAtMs: number[],
  nowMs = Date.now(),
): GroupActivityCounts {
  let activity24h = 0;
  let activity7d = 0;
  for (const t of postedAtMs) {
    if (!Number.isFinite(t)) continue;
    const age = nowMs - t;
    if (age < 0) continue;
    if (age <= GROUP_ACTIVITY_WEEK_MS) activity7d += 1;
    if (age <= GROUP_ACTIVITY_DAY_MS) activity24h += 1;
  }
  return { activity24h, activity7d };
}

export function countGroupActivityFromHistory(
  messages: unknown[],
  nowMs = Date.now(),
): GroupActivityCounts {
  const dates: number[] = [];
  for (const raw of messages) {
    const t = groupMessagePostedAtMs(raw);
    if (t != null) dates.push(t);
  }
  return countGroupActivityFromDates(dates, nowMs);
}

/** 그룹은 channel_posts 에 글을 남기지 않습니다. */
export function shouldSaveMtprotoPosts(linkType: string): boolean {
  return linkType !== 'group';
}
