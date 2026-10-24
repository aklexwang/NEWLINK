export interface TelegramChatMemberUser {
  id?: number;
  is_bot?: boolean;
  username?: string | null;
}

export interface TelegramChatAdministrator {
  status?: string;
  user?: TelegramChatMemberUser;
}

const ADMIN_STATUSES = new Set(['creator', 'administrator']);

/** getChatAdministrators 재확인 사이 간격 */
export const VERIFY_RECHECK_GAP_MS = 1_000;

export function parseBotUserIdFromToken(token: string): number | null {
  const match = token.trim().match(/^(\d+):/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

export function normalizeBotUsername(raw: string | null | undefined): string {
  return (raw ?? '').replace(/^@/, '').trim().toLowerCase();
}

/** 우리 봇이 관리자(소유자 포함) 목록에 있는지 */
export function isOurBotAdministrator(
  admins: TelegramChatAdministrator[],
  botId: number | null,
  botUsername: string,
): boolean {
  const handle = normalizeBotUsername(botUsername);
  return admins.some((member) => {
    if (!ADMIN_STATUSES.has(member.status ?? '')) return false;
    const user = member.user;
    if (!user?.is_bot) return false;
    if (botId != null && user.id === botId) return true;
    if (handle && normalizeBotUsername(user.username) === handle) return true;
    return false;
  });
}

/** 요청한 텔레그램 사용자가 creator 또는 administrator인지 */
export function isRequesterChannelAdmin(
  admins: TelegramChatAdministrator[],
  telegramUserId: number,
): boolean {
  return admins.some((member) => {
    if (!ADMIN_STATUSES.has(member.status ?? '')) return false;
    return member.user?.id === telegramUserId;
  });
}

export type RecheckDecision = 'keep' | 'unverify' | 'retry';

export type RecheckFetchResult =
  | { kind: 'network' }
  | {
      kind: 'http';
      status: number;
      body: {
        ok?: boolean;
        error_code?: number;
        description?: string;
        result?: TelegramChatAdministrator[];
      };
    };

export interface RecheckContext {
  botId: number | null;
  botUsername: string;
  ownerTelegramId: number | null;
}

function descriptionOf(body: { description?: string } | undefined): string {
  return (body?.description ?? '').toLowerCase();
}

/** 일시적 API 오류 — 인증을 유지하고 다음날 다시 시도 */
export function isTransientTelegramError(result: RecheckFetchResult): boolean {
  if (result.kind === 'network') return true;
  const { status, body } = result;
  if (status === 408 || status === 429 || status >= 500) return true;
  if (
    body.error_code === 429 ||
    (body.error_code != null && body.error_code >= 500)
  )
    return true;
  const description = descriptionOf(body);
  return (
    description.includes('too many requests') ||
    description.includes('retry after') ||
    description.includes('flood') ||
    description.includes('timeout') ||
    description.includes('internal server') ||
    description.includes('bad gateway') ||
    description.includes('service unavailable')
  );
}

/** 봇이 관리자가 아니거나 채팅에 접근할 수 없음 */
export function isLostAdminAccessError(
  result: Extract<RecheckFetchResult, { kind: 'http' }>,
): boolean {
  const description = descriptionOf(result.body);
  const code = result.body.error_code;
  if (code === 400 || code === 403) {
    return (
      description.includes('chat not found') ||
      description.includes('not found') ||
      description.includes('not enough rights') ||
      description.includes('administrator') ||
      description.includes('bot is not a member') ||
      description.includes('kicked') ||
      description.includes('chat_admin_required') ||
      description.includes('need administrator')
    );
  }
  return (
    description.includes('chat not found') ||
    description.includes('not enough rights') ||
    description.includes('bot is not a member') ||
    description.includes('kicked') ||
    description.includes('chat_admin_required') ||
    description.includes('need administrator')
  );
}

/** 인증 재확인 결과. retry는 인증을 유지합니다. */
export function decideVerifiedRecheck(
  fetch: RecheckFetchResult,
  ctx: RecheckContext,
): RecheckDecision {
  if (isTransientTelegramError(fetch)) return 'retry';

  if (
    fetch.kind === 'http' &&
    fetch.body.ok === true &&
    Array.isArray(fetch.body.result)
  ) {
    const admins = fetch.body.result;
    if (ctx.ownerTelegramId == null) return 'unverify';
    if (!isOurBotAdministrator(admins, ctx.botId, ctx.botUsername))
      return 'unverify';
    if (!isRequesterChannelAdmin(admins, ctx.ownerTelegramId))
      return 'unverify';
    return 'keep';
  }

  if (fetch.kind === 'http' && isLostAdminAccessError(fetch)) return 'unverify';
  return 'retry';
}
