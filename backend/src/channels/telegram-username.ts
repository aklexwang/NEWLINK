/** t.me 경로 중 공개 @username이 아닌 것 */
const RESERVED_PATHS = new Set([
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

/**
 * 채널 링크에서 공개 username을 뽑습니다.
 * 초대링크(t.me/+xxxx, joinchat)와 비공개 /c/ 경로는 null입니다.
 */
export function extractTelegramUsernameFromLink(
  link: string | null | undefined,
): string | null {
  if (!link?.trim()) return null;
  const raw = link.trim();

  if (
    /\/joinchat\//i.test(raw) ||
    /(?:t\.me|telegram\.me|telegram\.dog)\/\+/i.test(raw)
  ) {
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
  if (RESERVED_PATHS.has(candidate.toLowerCase())) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(candidate)) return null;

  return candidate.toLowerCase();
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
