/**
 * 홍보 자동화 규칙(순수 함수).
 *
 * 원칙: 방마다 정해진 횟수·간격을 지킨다. 텔레그램이 경고(FLOOD_WAIT·PEER_FLOOD·글쓰기 제한)를 보내면
 * 바로 멈춘다. 홍보 계정은 수집 계정과 완전히 분리한다.
 */

/** 방 규칙이 더 많이 허용해도 하루 이 횟수까지만(계정 보호) */
export const PROMO_ROOM_DAILY_CAP = 3;
/** 같은 방에 올리는 최소 간격(분). 방 규칙이 더 짧아도 이보다 짧게는 안 함 */
export const PROMO_ROOM_MIN_GAP_MIN = 180;
/** 어떤 방이든 두 글 사이 최소 간격(분) 기본값 */
export const PROMO_GLOBAL_GAP_MIN_DEFAULT = 30;
/** 하루 전체 최대 글 수 기본값(새 계정은 적게 시작) */
export const PROMO_DAILY_MAX_DEFAULT = 5;
/** 활동 시간(KST) 기본값: 10시~23시 */
export const PROMO_HOUR_START_DEFAULT = 10;
export const PROMO_HOUR_END_DEFAULT = 23;

export type PromoRule = {
  /** 소개글에서 찾은 하루 허용 횟수 */
  dailyLimit: number | null;
  /** 소개글에서 찾은 최소 간격(분) */
  minGapMinutes: number | null;
  /** 홍보 금지로 보이는 방 */
  forbidden: boolean;
  /** 근거가 된 문구(화면 표시용) */
  matched: string | null;
};

const FORBID_RE =
  /(타\s*방\s*)?(홍보|광고|링크\s*공유|링공)\s*(금지|불가|절대\s*금지|x\b|X\b|❌|🚫|사절|안\s*됩니다|하지\s*마)/;
const DAILY_RE =
  /(?:1\s*일|하루|일일|매일)\s*(?:에\s*)?(?:최대\s*)?(\d{1,2})\s*(?:회|번|개|건)/;
const GAP_RE =
  /(\d{1,2})\s*시간\s*(?:마다|간격|에\s*(?:1|한)\s*(?:회|번)|당\s*(?:1|한)\s*(?:회|번)|에\s*한번)/;
const GAP_MIN_RE = /(\d{1,3})\s*분\s*(?:마다|간격|에\s*(?:1|한)\s*(?:회|번))/;

function snippetAround(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 8);
  return text
    .slice(start, index + len + 8)
    .replace(/\s+/g, ' ')
    .trim();
}

/** 방 소개글(규칙)에서 홍보 횟수·간격·금지를 읽는다 */
export function detectPromoRule(about: string | null | undefined): PromoRule {
  const text = (about ?? '').slice(0, 4000);
  const rule: PromoRule = {
    dailyLimit: null,
    minGapMinutes: null,
    forbidden: false,
    matched: null,
  };
  if (!text.trim()) return rule;

  // "타방 홍보 금지"·"광고 금지"는 우리 같은 외부 홍보도 금지로 본다(안전 쪽).
  // "도배 금지"·"성인 금지"처럼 홍보 자체가 아닌 금지는 금지로 보지 않는다.
  const forbid = FORBID_RE.exec(text);
  if (forbid) {
    rule.forbidden = true;
    rule.matched = snippetAround(text, forbid.index, forbid[0].length);
  }
  const daily = DAILY_RE.exec(text);
  if (daily) {
    const n = Number(daily[1]);
    if (n >= 1 && n <= 50) {
      rule.dailyLimit = n;
      rule.matched ??= snippetAround(text, daily.index, daily[0].length);
    }
  }
  const gapH = GAP_RE.exec(text);
  if (gapH) {
    const h = Number(gapH[1]);
    if (h >= 1 && h <= 48) {
      rule.minGapMinutes = h * 60;
      rule.matched ??= snippetAround(text, gapH.index, gapH[0].length);
    }
  } else {
    const gapM = GAP_MIN_RE.exec(text);
    if (gapM) {
      const m = Number(gapM[1]);
      if (m >= 5 && m <= 600) {
        rule.minGapMinutes = m;
        rule.matched ??= snippetAround(text, gapM.index, gapM[0].length);
      }
    }
  }
  return rule;
}

/** 감지한 규칙으로 방 기본 설정(우리 안전 한도 적용) */
export function defaultTargetSettings(rule: PromoRule): {
  dailyLimit: number;
  minGapMinutes: number;
} {
  const dailyLimit = Math.max(
    1,
    Math.min(rule.dailyLimit ?? 1, PROMO_ROOM_DAILY_CAP),
  );
  const spread = Math.floor((24 * 60) / dailyLimit / 2); // 하루를 고르게 나눈 간격의 절반
  const minGapMinutes = Math.max(
    PROMO_ROOM_MIN_GAP_MIN,
    rule.minGapMinutes ?? 0,
    spread,
  );
  return { dailyLimit, minGapMinutes };
}

export type PromoTargetState = {
  id: string;
  enabled: boolean;
  status: string;
  dailyLimit: number;
  minGapMinutes: number;
  lastPostedAt: Date | null;
  nextAllowedAt: Date | null;
};

/** 지금 보낼 수 있는 방인지 */
export function isTargetEligible(
  t: PromoTargetState,
  todayCount: number,
  nowMs: number,
): boolean {
  if (!t.enabled || t.status !== 'ok') return false;
  if (todayCount >= Math.min(t.dailyLimit, PROMO_ROOM_DAILY_CAP)) return false;
  if (t.nextAllowedAt && t.nextAllowedAt.getTime() > nowMs) return false;
  if (t.lastPostedAt) {
    const gap = Math.max(t.minGapMinutes, PROMO_ROOM_MIN_GAP_MIN) * 60_000;
    if (nowMs - t.lastPostedAt.getTime() < gap) return false;
  }
  return true;
}

/** 다음에 보낼 방: 보낼 수 있는 방 중 가장 오래 전에 보낸 곳(한 번도 안 보낸 곳 먼저) */
export function pickNextTarget<T extends PromoTargetState>(
  targets: T[],
  todayCounts: Map<string, number>,
  nowMs: number,
): T | null {
  const eligible = targets.filter((t) =>
    isTargetEligible(t, todayCounts.get(t.id) ?? 0, nowMs),
  );
  if (eligible.length === 0) return null;
  eligible.sort(
    (a, b) =>
      (a.lastPostedAt?.getTime() ?? 0) - (b.lastPostedAt?.getTime() ?? 0),
  );
  return eligible[0];
}

/** KST 시(0~23) */
export function kstHour(nowMs: number): number {
  return new Date(nowMs + 9 * 3_600_000).getUTCHours();
}

/** KST 오늘 0시(UTC Date) */
export function kstDayStart(nowMs: number): Date {
  const k = new Date(nowMs + 9 * 3_600_000);
  return new Date(
    Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) -
      9 * 3_600_000,
  );
}

export function isPromoActiveHour(
  nowMs: number,
  start = PROMO_HOUR_START_DEFAULT,
  end = PROMO_HOUR_END_DEFAULT,
): boolean {
  const h = kstHour(nowMs);
  return start <= end ? h >= start && h < end : h >= start || h < end;
}

export type PromoErrorKind =
  /** 잠깐 쉬어라: 전체 멈춤(seconds 동안) */
  | 'flood'
  /** 이 방만 잠깐(슬로우 모드) */
  | 'slowmode'
  /** 계정이 스팸 제한에 걸림: 전체 멈춤(하루) */
  | 'account_limited'
  /** 계정 로그인 문제: 전체 멈춤 */
  | 'auth'
  /** 이 방에 글을 못 씀(강퇴·권한 없음·나감): 방 끔 */
  | 'room_blocked'
  /** 사진만 막힘: 다음부터 글만 */
  | 'no_media'
  | 'other';

export function classifyPromoError(raw: unknown): {
  kind: PromoErrorKind;
  seconds: number | null;
  code: string;
} {
  const msg =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : JSON.stringify(raw ?? '');
  const code = (/[A-Z][A-Z0-9_]{3,}/.exec(msg)?.[0] ?? msg).slice(0, 80);
  const secs = /(\d+)/.exec(
    /(?:FLOOD_WAIT|SLOWMODE_WAIT|FLOOD_PREMIUM_WAIT)_(\d+)/.exec(msg)?.[0] ??
      /wait of (\d+) seconds/i.exec(msg)?.[0] ??
      '',
  );
  const seconds = secs ? Number(secs[1]) : null;
  if (/SLOWMODE_WAIT/.test(msg)) return { kind: 'slowmode', seconds, code };
  if (/FLOOD_WAIT|FLOOD_PREMIUM_WAIT|wait of \d+ seconds/i.test(msg)) {
    return { kind: 'flood', seconds, code };
  }
  if (/PEER_FLOOD|USER_RESTRICTED|SPAMBOT|USER_IS_BLOCKED/.test(msg)) {
    return { kind: 'account_limited', seconds: null, code };
  }
  if (
    /AUTH_KEY_UNREGISTERED|AUTH_KEY_DUPLICATED|SESSION_REVOKED|USER_DEACTIVATED/.test(
      msg,
    )
  ) {
    return { kind: 'auth', seconds: null, code };
  }
  if (/CHAT_SEND_PHOTOS_FORBIDDEN|CHAT_SEND_MEDIA_FORBIDDEN/.test(msg)) {
    return { kind: 'no_media', seconds: null, code };
  }
  if (
    /CHAT_WRITE_FORBIDDEN|USER_BANNED_IN_CHANNEL|CHANNEL_PRIVATE|CHAT_ADMIN_REQUIRED|CHAT_RESTRICTED|CHAT_SEND_PLAIN_FORBIDDEN|PEER_ID_INVALID|CHANNEL_INVALID|USER_NOT_PARTICIPANT|CHAT_GUEST_SEND_FORBIDDEN/.test(
      msg,
    )
  ) {
    return { kind: 'room_blocked', seconds: null, code };
  }
  return { kind: 'other', seconds, code };
}
