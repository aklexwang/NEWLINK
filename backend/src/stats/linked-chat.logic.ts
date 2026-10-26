/**
 * 채널 ↔ 연결된 대화방(댓글·토론 그룹) 판별.
 *
 * 공개 채널을 MTProto channels.GetFullChannel 로 읽으면 fullChat.linkedChatId 와
 * chats[] 안에 연결된 대화방(비공개여도) 정보가 같이 온다. 그룹에 가입하지 않는다.
 * 반대로 그룹을 읽으면 linkedChatId 는 부모 채널을 가리킨다.
 */

export type LinkedChatInfo = {
  /** -100 접두사를 뗀 양수 채널 id */
  telegramChatId: number;
  title: string | null;
  username: string | null;
  createdOn: Date | null;
  isGroup: boolean;
};

type RawChat = {
  id?: unknown;
  title?: string;
  username?: string | null;
  usernames?: Array<{ username?: string; active?: boolean }> | null;
  date?: number;
  megagroup?: boolean;
  broadcast?: boolean;
};

/**
 * 봇 API 는 채널 id 를 -100XXXXXXXXXX 로, MTProto 는 XXXXXXXXXX 로 준다. 비교는 항상 이 값으로 한다.
 */
export function normalizeTelegramChatId(
  raw: number | string | bigint | null | undefined,
): number | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!/^-?\d+$/.test(text)) return null;
  const stripped = text.startsWith('-100')
    ? text.slice(4)
    : text.replace(/^-/, '');
  const n = Number(stripped);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** DB 에 두 형식이 섞여 있어 조회할 때 쓸 후보 값 */
export function telegramChatIdVariants(id: number): number[] {
  return [id, Number(`-100${id}`)];
}

function chatUsername(chat: RawChat): string | null {
  const direct = chat.username?.trim();
  if (direct) return direct.toLowerCase();
  const active = (chat.usernames ?? []).find((u) => u?.active && u.username);
  return active?.username ? active.username.toLowerCase() : null;
}

function unixToDate(seconds: number | undefined): Date | null {
  if (
    typeof seconds !== 'number' ||
    !Number.isFinite(seconds) ||
    seconds <= 0
  ) {
    return null;
  }
  return new Date(seconds * 1000);
}

/** GetFullChannel 결과의 chats[] 에서 요청한 채널을 id 로 고른다 (순서에 기대지 않음) */
export function pickChatById<T extends RawChat>(
  chats: T[] | undefined,
  channelId: unknown,
): T | undefined {
  const want = normalizeTelegramChatId(channelId as never);
  if (!chats?.length) return undefined;
  if (want == null) return chats[0];
  return (
    chats.find((chat) => normalizeTelegramChatId(chat.id as never) === want) ??
    chats[0]
  );
}

/** GetFullChannel 결과에서 연결된 대화방(또는 부모 채널) 정보를 꺼낸다 */
export function parseLinkedChat(full: {
  fullChat?: { linkedChatId?: unknown } | null;
  chats?: RawChat[];
}): LinkedChatInfo | null {
  const linkedId = normalizeTelegramChatId(
    full.fullChat?.linkedChatId as never,
  );
  if (linkedId == null) return null;
  const chat = (full.chats ?? []).find(
    (item) => normalizeTelegramChatId(item.id as never) === linkedId,
  );
  return {
    telegramChatId: linkedId,
    title: chat?.title?.trim() || null,
    username: chat ? chatUsername(chat) : null,
    createdOn: unixToDate(chat?.date),
    isGroup: chat ? Boolean(chat.megagroup) && !chat.broadcast : true,
  };
}

/** 제목 비교용: 공백·기호·이모지를 지우고 소문자 */
export function normalizeChatTitle(title: string | null | undefined): string {
  return (title ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * 연결된 대화방이 비공개(초대 링크로만 등록된 그룹)일 때, 제목으로 우리 DB 의 그룹 한 개를 찾는다.
 * 제목이 정확히 같은 후보가 딱 하나일 때만 연결한다 (둘 이상이면 틀릴 수 있어 연결하지 않는다).
 */
export function matchGroupByTitle<T extends { title: string | null }>(
  candidates: T[],
  linkedTitle: string | null,
): T | null {
  const want = normalizeChatTitle(linkedTitle);
  if (want.length < 2) return null;
  const hits = candidates.filter(
    (row) => normalizeChatTitle(row.title) === want,
  );
  return hits.length === 1 ? hits[0] : null;
}
