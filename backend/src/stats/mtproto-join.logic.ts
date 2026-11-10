/**
 * 비공개(초대 링크) 채널 자동 가입 규칙. 2026-10-29 사용자 결정:
 * 수집 전용 새 계정(프리미엄)으로 비공개 "채널"만 천천히 가입해 글 정보까지 읽는다.
 * - 하루 기본 15개, 계정 전체 950개(프리미엄 한도 1000 아래)까지
 * - 가입 사이 최소 3분
 * - 그룹·승인 필요(가입 신청) 방은 가입하지 않는다
 */
export const MTPROTO_JOIN_DAILY_DEFAULT = 15;
export const MTPROTO_JOIN_TOTAL_MAX = 950;
export const MTPROTO_JOIN_MIN_GAP_MS = 3 * 60 * 1000;
export const MTPROTO_JOIN_TOTAL_KEY = 'mtproto:joined-total';

/** 환경 변수 MTPROTO_JOIN_DAILY. 0 이면 가입 끔 */
export function parseJoinDaily(raw?: string | null): number {
  if (raw == null || String(raw).trim() === '') {
    return MTPROTO_JOIN_DAILY_DEFAULT;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return MTPROTO_JOIN_DAILY_DEFAULT;
  return Math.floor(n);
}

/** CheckChatInvite 가 회원 아님(ChatInvite)일 때도 담겨 오는 공개 정보 */
export interface InviteMeta {
  title: string | null;
  about: string | null;
  participantsCount: number | null;
}

/**
 * 회원도 아니고 엿보기(peek)·가입도 안 되는 비공개 방이라도, CheckChatInvite 가 돌려준
 * ChatInvite 에는 제목·소개·정확한 회원 수가 들어 있다. 그걸 뽑아 최소한의 정보라도 저장한다.
 * (A안. 글 수·조회율은 여전히 엿보기/가입이 돼야 읽는다)
 */
export function inviteMetadata(result: unknown): InviteMeta | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as {
    className?: string;
    title?: unknown;
    about?: unknown;
    participantsCount?: unknown;
  };
  if (r.className !== 'ChatInvite') return null;
  const title =
    typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null;
  const about =
    typeof r.about === 'string' && r.about.trim() ? r.about.trim() : null;
  const participantsCount =
    typeof r.participantsCount === 'number' && r.participantsCount > 0
      ? r.participantsCount
      : null;
  if (title == null && about == null && participantsCount == null) return null;
  return { title, about, participantsCount };
}

/** CheckChatInvite 결과가 "아직 회원 아님 + 공개 채널형(broadcast) + 승인 필요 없음" 인지 */
export function isJoinableChannelInvite(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  const r = result as {
    className?: string;
    broadcast?: boolean;
    megagroup?: boolean;
    requestNeeded?: boolean;
  };
  return (
    r.className === 'ChatInvite' &&
    r.broadcast === true &&
    r.megagroup !== true &&
    r.requestNeeded !== true
  );
}

export function canJoinAnother(input: {
  joinsToday: number;
  dailyMax: number;
  joinedTotal: number;
  totalMax?: number;
  lastJoinAt: number;
  now: number;
  blocked?: boolean;
  minGapMs?: number;
}): boolean {
  if (input.blocked) return false;
  if (input.dailyMax <= 0) return false;
  if (input.joinsToday >= input.dailyMax) return false;
  if (input.joinedTotal >= (input.totalMax ?? MTPROTO_JOIN_TOTAL_MAX)) {
    return false;
  }
  const gap = input.minGapMs ?? MTPROTO_JOIN_MIN_GAP_MS;
  return input.lastJoinAt <= 0 || input.now - input.lastJoinAt >= gap;
}

/** ImportChatInvite 결과(Updates)에서 가입한 채널 찾기 */
export function joinedChannelFromUpdates(result: unknown): {
  id: unknown;
  accessHash: unknown;
  title?: string;
  date?: number;
  megagroup?: boolean;
  broadcast?: boolean;
} | null {
  if (!result || typeof result !== 'object') return null;
  const chats = (result as { chats?: unknown }).chats;
  if (!Array.isArray(chats)) return null;
  for (const raw of chats) {
    if (!raw || typeof raw !== 'object') continue;
    const chat = raw as Record<string, unknown>;
    if (chat.className !== 'Channel') continue;
    if (chat.id == null || chat.accessHash == null) continue;
    return {
      id: chat.id,
      accessHash: chat.accessHash,
      title: typeof chat.title === 'string' ? chat.title : undefined,
      date: typeof chat.date === 'number' ? chat.date : undefined,
      megagroup: chat.megagroup === true,
      broadcast: chat.broadcast === true,
    };
  }
  return null;
}

/** 가입하지 않은 이유(화면 표시용) */
export function describeUnjoinableInvite(result: unknown): string {
  if (!result || typeof result !== 'object') return '확인 결과 없음';
  const r = result as {
    className?: string;
    broadcast?: boolean;
    megagroup?: boolean;
    requestNeeded?: boolean;
  };
  if (r.className !== 'ChatInvite')
    return `확인 결과 ${r.className ?? '알 수 없음'}`;
  if (r.requestNeeded) return '가입 승인 필요';
  if (r.megagroup || r.broadcast !== true) return '그룹(가입 안 함)';
  return '기타';
}
