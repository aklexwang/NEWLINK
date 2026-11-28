/** 홍보 계정 자동 가입: 새 계정이 한꺼번에 가입하면 텔레그램이 막으니 아주 천천히 */
export const PROMO_JOIN_DAILY_DEFAULT = 5;
export const PROMO_JOIN_DAILY_LIMIT = 20;
/** 가입과 가입 사이 최소 간격(분). 여기에 0~30분을 더 흔든다 */
export const PROMO_JOIN_GAP_MIN = 60;

/** 이번 차례에 가입해도 되는지 */
export function isJoinDue(input: {
  nowMs: number;
  lastJoinAtMs: number | null;
  joinsToday: number;
  dailyLimit: number;
  jitterMin: number;
}): boolean {
  if (input.joinsToday >= input.dailyLimit) return false;
  if (input.lastJoinAtMs == null) return true;
  return (
    input.nowMs - input.lastJoinAtMs >=
    (PROMO_JOIN_GAP_MIN + input.jitterMin) * 60_000
  );
}

export type JoinErrorKind =
  | 'requested' // 승인제 방: 가입 신청됨
  | 'skip' // 이 방만 못 들어감 (없는 아이디·비공개·차단)
  | 'too_many' // 들어갈 수 있는 방 수 한도
  | 'flood' // 잠시 기다려라
  | 'limited' // 계정 제한(스팸)
  | 'auth' // 로그인 풀림
  | 'other';

export function classifyJoinError(raw: unknown): {
  kind: JoinErrorKind;
  code: string;
  seconds: number | null;
} {
  const msg =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : JSON.stringify(raw ?? '');
  const code = (/[A-Z][A-Z0-9_]{3,}/.exec(msg)?.[0] ?? msg).slice(0, 80);
  const sec =
    /(?:FLOOD_WAIT|FLOOD_PREMIUM_WAIT)_(\d+)/.exec(msg) ??
    /wait of (\d+) seconds/i.exec(msg);
  const seconds = sec ? Number(sec[1]) : null;
  if (/INVITE_REQUEST_SENT/.test(msg))
    return { kind: 'requested', code, seconds };
  if (/FLOOD_WAIT|FLOOD_PREMIUM_WAIT|wait of \d+ seconds/i.test(msg))
    return { kind: 'flood', code, seconds };
  if (/CHANNELS_TOO_MUCH/.test(msg)) return { kind: 'too_many', code, seconds };
  if (/PEER_FLOOD|USER_RESTRICTED|SPAMBOT/.test(msg))
    return { kind: 'limited', code, seconds };
  if (
    /AUTH_KEY_UNREGISTERED|AUTH_KEY_DUPLICATED|SESSION_REVOKED|USER_DEACTIVATED/.test(
      msg,
    )
  )
    return { kind: 'auth', code, seconds };
  if (
    /USERNAME_NOT_OCCUPIED|USERNAME_INVALID|CHANNEL_PRIVATE|CHANNEL_INVALID|USER_BANNED_IN_CHANNEL|CHANNELS_ADMIN_PUBLIC_TOO_MUCH|INVITE_HASH|not a group|STARS|PAYMENT/i.test(
      msg,
    )
  )
    return { kind: 'skip', code, seconds };
  return { kind: 'other', code, seconds };
}
