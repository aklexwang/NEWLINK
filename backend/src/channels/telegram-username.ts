/** t.me 경로 중 공개 @username이 아닌 것 */
export const RESERVED_TELEGRAM_PATHS = new Set([
  's',
  'c',
  'a',
  'addstickers',
  'addtheme',
  'addlist',
  'share',
  'proxy',
  'socks',
  'setlanguage',
  'iv',
  'login',
  'bg',
  'invoice',
  'confirmphone',
  'joinchat',
  'boost',
  'giftcode',
]);

/** 초대 링크(t.me/+ , joinchat)인지 */
export function isInviteOnlyLink(link: string | null | undefined): boolean {
  if (!link?.trim()) return false;
  const raw = link.trim();
  return (
    /\/joinchat\//i.test(raw) ||
    /(?:t\.me|telegram\.me|telegram\.dog)\/\+/i.test(raw)
  );
}

/**
 * 채널 링크에서 공개 username을 뽑습니다.
 * 초대링크(t.me/+xxxx, joinchat)와 비공개 /c/ 경로는 null입니다.
 */
export function extractTelegramUsernameFromLink(
  link: string | null | undefined,
): string | null {
  if (!link?.trim()) return null;
  const raw = link.trim();

  if (isInviteOnlyLink(raw)) {
    return null;
  }

  let href = raw;
  if (!/^https?:\/\//i.test(href)) {
    if (/^(?:t\.me|telegram\.me|telegram\.dog)\//i.test(href)) {
      href = `https://${href}`;
    } else if (href.startsWith('@')) {
      href = `https://t.me/${href.slice(1)}`;
    } else {
      href = `https://t.me/${href}`;
    }
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./i, '').toLowerCase();
  if (!['t.me', 'telegram.me', 'telegram.dog'].includes(host)) {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  let candidate = parts[0];
  if (candidate.toLowerCase() === 's' && parts[1]) {
    candidate = parts[1];
  }
  candidate = candidate.replace(/^@/, '');
  if (candidate.startsWith('+')) return null;
  if (RESERVED_TELEGRAM_PATHS.has(candidate.toLowerCase())) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(candidate)) return null;

  return candidate.toLowerCase();
}

/** 이미 username 이 있으면 그대로 두고, 비었으면 link 에서 뽑는다. 초대 링크는 null */
export function usernameToFillFromLink(
  username: string | null | undefined,
  link: string | null | undefined,
): string | null {
  const current = (username ?? '').replace(/^@/, '').trim();
  if (current) return null;
  return extractTelegramUsernameFromLink(link);
}

export function usernamesToFillFromLinks(
  rows: Array<{ id: string; username?: string | null; link: string }>,
): Array<{ id: string; username: string }> {
  const out: Array<{ id: string; username: string }> = [];
  for (const row of rows) {
    const next = usernameToFillFromLink(row.username, row.link);
    if (next) out.push({ id: row.id, username: next });
  }
  return out;
}

/** 저장할 때 link 기준 username. 초대·비공개는 null */
export function usernameFromChannelLink(
  link: string | null | undefined,
): string | null {
  return extractTelegramUsernameFromLink(link);
}

/** 봇 username (…bot / …_bot) */
export function isTelegramBotUsername(username: string): boolean {
  return /bot$/i.test(username.replace(/^@/, '').trim());
}

/** 눈덩이 발견에 넣을 수 있는 공개 채널 아이디인지 */
export function isDiscoverableUsername(
  username: string | null | undefined,
  selfUsername?: string | null,
): username is string {
  if (!username) return false;
  const u = username.replace(/^@/, '').toLowerCase();
  if (!u) return false;
  if (isTelegramBotUsername(u)) return false;
  const self = selfUsername?.replace(/^@/, '').trim().toLowerCase();
  if (self && u === self) return false;
  return true;
}

/** 초대 링크의 해시. t.me/+AbC_12 → "AbC_12", t.me/joinchat/AbC → "AbC". 아니면 null */
export function inviteHashFromLink(
  link: string | null | undefined,
): string | null {
  const raw = (link ?? '').trim();
  const match =
    raw.match(/(?:t\.me|telegram\.me|telegram\.dog)\/\+([A-Za-z0-9_-]{6,})/i) ??
    raw.match(/\/joinchat\/([A-Za-z0-9_-]{6,})/i);
  return match ? match[1] : null;
}
