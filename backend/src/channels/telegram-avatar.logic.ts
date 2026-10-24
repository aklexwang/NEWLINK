const BOT_FILE_RE = /api\.telegram\.org\/file\/bot/i;

const DOWNLOAD_EXACT = new Set([
  't.me',
  'telegram.me',
  'telegram.org',
  'telesco.pe',
  'telegram-cdn.org',
  'cdn-telegram.org',
]);

const DOWNLOAD_SUFFIX = [
  '.telesco.pe',
  '.telegram-cdn.org',
  '.cdn-telegram.org',
];

export function isTelegramBotFileUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return BOT_FILE_RE.test(url);
}

export function stripUnsafeAvatarUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  if (isTelegramBotFileUrl(url)) return null;
  return url;
}

export function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, '').toLowerCase();
}

/** t.me / telegram.me 만. evilt.me 처럼 끝이 t.me 인 호스트는 거절합니다. */
export function isAllowedTelegramPageHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  return host === 't.me' || host === 'telegram.me';
}

/** 회원 제보 링크. 스킴 있는 t.me / telegram.me 만. */
export function isTelegramSubmitLink(raw: string): boolean {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    return isAllowedTelegramPageHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function isAllowedAvatarDownloadHost(hostname: string): boolean {
  const host = normalizeHostname(hostname);
  if (DOWNLOAD_EXACT.has(host)) return true;
  return DOWNLOAD_SUFFIX.some(
    (suffix) => host.endsWith(suffix) && host.length > suffix.length,
  );
}

export function parseTelegramAvatarPageLink(
  link?: string,
  username?: string,
): { ok: true; link: string } | { ok: false; message: string } {
  const rawLink = (link ?? '').trim();
  if (rawLink) {
    try {
      const parsed = new URL(rawLink);
      if (!/^https?:$/i.test(parsed.protocol)) {
        return { ok: false, message: 't.me 또는 telegram.me 링크만 허용합니다.' };
      }
      if (!isAllowedTelegramPageHost(parsed.hostname)) {
        return { ok: false, message: 't.me 또는 telegram.me 링크만 허용합니다.' };
      }
      return { ok: true, link: parsed.toString() };
    } catch {
      return { ok: false, message: 't.me 또는 telegram.me 링크만 허용합니다.' };
    }
  }
  const name = (username ?? '').trim().replace(/^@/, '');
  if (!name || !/^[a-zA-Z0-9_]{4,}$/.test(name) || name.startsWith('+')) {
    return { ok: false, message: 'link 또는 username 이 필요합니다.' };
  }
  return { ok: true, link: `https://t.me/${name}` };
}
