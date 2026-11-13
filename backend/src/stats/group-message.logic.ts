/**
 * 그룹 GetHistory 결과 → 저장할 대화 행(개인정보 가림, 보낸 사람 없음) + 최근 7일 참여자 수.
 * 보낸 사람 ID 는 "몇 명인지" 세는 데만 쓰고 결과에 넣지 않는다.
 */
import { maskPersonalInfo } from './pii-mask.logic';

export const GROUP_MESSAGE_TEXT_MAX = 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type GroupMessageRow = {
  messageId: number;
  postedAt: Date;
  text: string | null;
  mediaType: 'text' | 'photo' | 'video' | 'file' | 'other';
  isAdminPost: boolean;
  isPinned: boolean;
};

type RawGroupMessage = {
  className?: string;
  id?: unknown;
  date?: unknown;
  message?: unknown;
  post?: unknown;
  pinned?: unknown;
  media?: { className?: string } | null;
  fromId?: { className?: string; userId?: unknown; channelId?: unknown } | null;
};

function mediaTypeOf(className?: string): GroupMessageRow['mediaType'] {
  const name = (className ?? '').toLowerCase();
  if (!name || name.includes('empty')) return 'text';
  if (name.includes('photo')) return 'photo';
  if (name.includes('video')) return 'video';
  if (name.includes('document')) return 'file';
  return 'other';
}

function clip(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
}

/** 한 메시지 → 저장 행. 서비스 메시지(입장·고정 알림 등)·빈 메시지는 null */
export function toGroupMessageRow(
  raw: unknown,
  pinnedMsgId: number | null = null,
): GroupMessageRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as RawGroupMessage;
  if (msg.className && msg.className !== 'Message') return null;
  const id = Number(msg.id);
  const date = Number(msg.date);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(date) || date <= 0) {
    return null;
  }
  const mediaType = mediaTypeOf(msg.media?.className);
  const masked = maskPersonalInfo(
    typeof msg.message === 'string' ? msg.message : '',
  ).trim();
  if (!masked && mediaType === 'text') return null;
  return {
    messageId: id,
    postedAt: new Date(date * 1000),
    text: masked ? clip(masked, GROUP_MESSAGE_TEXT_MAX) : null,
    mediaType,
    // 익명 운영자(그룹 이름으로 보냄)·연결 채널 글은 fromId 가 채널이거나 post=true
    isAdminPost: msg.post === true || msg.fromId?.className === 'PeerChannel',
    isPinned: msg.pinned === true || (pinnedMsgId != null && id === pinnedMsgId),
  };
}

export function summarizeGroupMessages(
  messages: unknown[],
  input: { pinnedMsgId?: number | null; nowMs?: number } = {},
): { rows: GroupMessageRow[]; activeSenders7d: number } {
  const nowMs = input.nowMs ?? Date.now();
  const pinned = input.pinnedMsgId ?? null;
  const rows: GroupMessageRow[] = [];
  const seen = new Set<number>();
  const senders = new Set<string>();
  for (const raw of messages) {
    const row = toGroupMessageRow(raw, pinned);
    if (!row || seen.has(row.messageId)) continue;
    seen.add(row.messageId);
    rows.push(row);
    const from = (raw as RawGroupMessage).fromId;
    if (
      nowMs - row.postedAt.getTime() <= WEEK_MS &&
      from?.className === 'PeerUser' &&
      from.userId != null
    ) {
      senders.add(String(from.userId));
    }
  }
  rows.sort((a, b) => b.messageId - a.messageId);
  return { rows, activeSenders7d: senders.size };
}

/**
 * 비공개(초대 링크) 그룹의 초대 링크를 확인해도 되는지.
 * 그룹은 자동 가입하지 않으므로, 수집 계정이 회원일 가능성이 있는 경우만: 내가 "요청함"을 눌렀거나
 * 어드민에서 직접 [지금 수집]/[지금 확인]을 눌렀을 때.
 */
export function shouldCheckInviteGroup(
  channel: { joinRequestedAt?: Date | null },
  opts: { manual?: boolean } = {},
): boolean {
  return opts.manual === true || channel.joinRequestedAt != null;
}
