import {
  clipPostExcerpt,
  detectChannelLanguage,
  detectChannelLanguageResult,
  hangulRatio,
  LANGUAGE_EXCERPT_MAX,
  LANGUAGE_MIN_POST_EXCERPTS,
  type ChannelLanguage,
} from '../channels/channel-language.logic';

/** 공개 채널·그룹만 MTProto 로 읽을 때 쓰는 규칙. 가입·참여자 조회는 여기서 막습니다. */

export const MTPROTO_MIN_GAP_MS = 1_500;
export const MTPROTO_DEFAULT_DAILY_LIMIT = 3_000;
export const MTPROTO_HISTORY_LIMIT = 50;
export const MTPROTO_EXCERPT_MAX = 200;
export const MTPROTO_CONNECT_TIMEOUT_MS = 30_000;
export const MTPROTO_REQUEST_TIMEOUT_MS = 30_000;
export const CHANNEL_COLLECT_TIMEOUT_MS = 120_000;
export const FLOOD_WAIT_MAX_MS = 300_000;
export const MTPROTO_TIMEOUT_STREAK_DISABLE = 3;

export class MtprotoTimeoutError extends Error {
  constructor(message = 'timeout:mtproto') {
    super(message);
    this.name = 'MtprotoTimeoutError';
  }
}

export class FloodWaitTooLongError extends Error {
  seconds: number;
  constructor(seconds: number) {
    super('FLOOD_WAIT_TOO_LONG');
    this.name = 'FloodWaitTooLongError';
    this.seconds = seconds;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'timeout:mtproto',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new MtprotoTimeoutError(label)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    void promise.catch(() => undefined);
  }
}

export function isMtprotoTimeoutError(error: unknown): boolean {
  return (
    error instanceof MtprotoTimeoutError ||
    (error instanceof Error && error.message.startsWith('timeout:'))
  );
}

export function nextTimeoutStreak(current: number, timedOut: boolean): number {
  if (!timedOut) return 0;
  return current + 1;
}

export function shouldDisableMtprotoAfterTimeouts(
  streak: number,
  limit = MTPROTO_TIMEOUT_STREAK_DISABLE,
): boolean {
  return streak >= limit;
}

export function shouldDisableForFloodWait(
  waitMs: number,
  maxMs = FLOOD_WAIT_MAX_MS,
): boolean {
  return waitMs > maxMs;
}

/** 수집기가 호출해도 되는 TL 메서드만 */
export const MTPROTO_ALLOWED_METHODS = [
  'contacts.ResolveUsername',
  'contacts.Search',
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
  if ((MTPROTO_FORBIDDEN_METHODS as readonly string[]).includes(name)) {
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
  options?: {
    maxWaitMs?: number;
    onWait?: (seconds: number) => void;
  },
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const wait = floodWaitMs(error);
    if (wait == null) throw error;
    const seconds = Math.ceil(wait / 1000);
    const maxWaitMs = options?.maxWaitMs ?? FLOOD_WAIT_MAX_MS;
    if (shouldDisableForFloodWait(wait, maxWaitMs)) {
      throw new FloodWaitTooLongError(seconds);
    }
    options?.onWait?.(seconds);
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

/** 초 단위·밀리초·bigint 시각을 Date 로 바꿉니다. */
export function unixSecondsToDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  let n: number;
  if (typeof value === 'bigint') n = Number(value);
  else if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim()) n = Number(value);
  else if (typeof value === 'object' && 'valueOf' in value) {
    n = Number((value as { valueOf: () => unknown }).valueOf());
  } else n = Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
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
export function telegramTlClassName(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const rec = raw as { className?: unknown; classType?: unknown };
  const ctor =
    typeof (raw as { constructor?: { name?: string } }).constructor?.name ===
    'string'
      ? (raw as { constructor: { name: string } }).constructor.name
      : '';
  const rawName =
    (typeof rec.className === 'string' && rec.className) ||
    (typeof rec.classType === 'string' && rec.classType) ||
    ctor;
  return rawName.replace(/^Api\./, '').trim();
}

/** 그룹 활동량·언어에 쓰는 일반 메시지만. 입장/공지 서비스 메시지는 빼습니다. */
export function isCountableGroupMessage(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const name = telegramTlClassName(raw).toLowerCase();
  if (name.includes('service') || name.includes('empty')) return false;
  if (!name || name === 'message' || name.endsWith('.message')) return true;
  const rec = raw as { date?: unknown; id?: unknown };
  return rec.date != null && rec.id != null;
}

export function groupMessagePostedAtMs(raw: unknown): number | null {
  if (!isCountableGroupMessage(raw)) return null;
  const msg = raw as { date?: unknown };
  const postedAt = unixSecondsToDate(msg.date);
  return postedAt ? postedAt.getTime() : null;
}

export function unixSecondsAgo(windowMs: number, nowMs = Date.now()): number {
  return Math.max(1, Math.floor((nowMs - windowMs) / 1000));
}

export function firstHistoryMessageId(messages: unknown[]): number | null {
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const id = Number((raw as { id?: unknown }).id);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

export function firstHistoryMessagePostedAtMs(
  messages: unknown[],
): number | null {
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') continue;
    const postedAt = unixSecondsToDate((raw as { date?: unknown }).date);
    if (postedAt) return postedAt.getTime();
  }
  return null;
}

/** 최신 번호 - 기준 번호. 없거나 음수면 0 */
export function activityFromMessageIds(
  latestId: number | null,
  baselineId: number | null,
): number {
  if (latestId == null || !Number.isFinite(latestId) || latestId <= 0) return 0;
  if (baselineId == null || !Number.isFinite(baselineId) || baselineId <= 0) {
    return Math.max(0, Math.floor(latestId));
  }
  return Math.max(0, Math.floor(latestId) - Math.floor(baselineId));
}

/**
 * 창 안에 최신 글이 없으면 0.
 * 있으면 최신 번호와 창 시작 시점 번호의 차이입니다.
 */
export function activityInWindow(input: {
  latestId: number | null;
  latestPostedAtMs: number | null;
  baselineId: number | null;
  windowMs: number;
  nowMs?: number;
}): number {
  const nowMs = input.nowMs ?? Date.now();
  if (input.latestId == null || input.latestId <= 0) return 0;
  if (
    input.latestPostedAtMs == null ||
    nowMs - input.latestPostedAtMs > input.windowMs
  ) {
    return 0;
  }
  return activityFromMessageIds(input.latestId, input.baselineId);
}

/** 그룹은 channel_posts 에 글을 남기지 않습니다. */
export function shouldSaveMtprotoPosts(linkType: string): boolean {
  return linkType !== 'group';
}

export type GroupHistorySummary = {
  activity: GroupActivityCounts;
  language: ChannelLanguage;
  hangulRatio: number | null;
  latestPostedAt: Date | null;
  messageCount: number;
};

/**
 * 그룹 GetHistory 를 한 번 훑어 활동량·언어만 계산합니다.
 * 본문·보낸 사람은 반환값에 넣지 않습니다.
 */
export function summarizeGroupHistory(
  messages: unknown[],
  input: {
    title?: string | null;
    description?: string | null;
    nowMs?: number;
  } = {},
): GroupHistorySummary {
  const nowMs = input.nowMs ?? Date.now();
  const dates: number[] = [];
  const excerpts: string[] = [];
  for (const raw of messages) {
    const postedMs = groupMessagePostedAtMs(raw);
    if (postedMs != null) dates.push(postedMs);
    if (!isCountableGroupMessage(raw)) continue;
    const text =
      raw && typeof raw === 'object' && 'message' in raw
        ? clipPostExcerpt(
            typeof (raw as { message?: unknown }).message === 'string'
              ? (raw as { message: string }).message
              : '',
            LANGUAGE_EXCERPT_MAX,
          )
        : null;
    if (text) excerpts.push(text);
  }

  const latestMs = dates.length > 0 ? Math.max(...dates) : null;
  const latestPostedAt = latestMs != null ? new Date(latestMs) : null;

  let language: ChannelLanguage;
  let ratio: number | null = null;
  if (excerpts.length < LANGUAGE_MIN_POST_EXCERPTS) {
    language = detectChannelLanguage({
      title: input.title,
      description: input.description,
    });
  } else {
    const detected = detectChannelLanguageResult({
      title: input.title,
      description: input.description,
      excerpts,
    });
    language = detected.language;
    const combined = [input.title, input.description, ...excerpts]
      .map((part) => (part ?? '').trim())
      .filter(Boolean)
      .join('\n');
    ratio = Math.round(hangulRatio(combined) * 10_000) / 10_000;
  }
  excerpts.length = 0;

  return {
    activity: { activity24h: 0, activity7d: 0 },
    language,
    hangulRatio: ratio,
    latestPostedAt,
    messageCount: dates.length,
  };
}
