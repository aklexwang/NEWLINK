import { resolveMediaUrl } from './mediaUrl';

export function extractTelegramUsername(link: string): string | null {
  const match = link.match(/t\.me\/([a-zA-Z0-9_]{4,})/i);
  if (!match) return null;
  const name = match[1];
  if (name === 's' || name === 'joinchat' || name.startsWith('+')) return null;
  return name;
}

function isDeadLocalUpload(path: string): boolean {
  return path.startsWith('/api/uploads/');
}

/** 백엔드가 텔레그램에서 아바타를 다시 받아 주는 프록시 URL */
export function buildTelegramAvatarProxyPath(link: string): string {
  return `/api/media/telegram-avatar?link=${encodeURIComponent(link)}`;
}

export function getChannelAvatarSources(
  channel: { avatarUrl?: string | null; link: string },
  options?: { includeStoredAvatar?: boolean },
): string[] {
  const includeStoredAvatar = options?.includeStoredAvatar ?? true;
  const sources: string[] = [];

  // 1) API 프록시 — Render에서 /api/uploads 파일이 사라져도 링크 기준으로 복구
  if (channel.link) {
    const proxy = resolveMediaUrl(buildTelegramAvatarProxyPath(channel.link));
    if (proxy) sources.push(proxy);
  }

  // 2) DB에 저장된 URL (죽은 로컬 업로드는 제외)
  if (includeStoredAvatar && channel.avatarUrl && !isDeadLocalUpload(channel.avatarUrl)) {
    const resolved = resolveMediaUrl(channel.avatarUrl);
    if (resolved) sources.push(resolved);
  }

  // 3) 텔레그램 userpic 직접
  const username = extractTelegramUsername(channel.link);
  if (username) {
    sources.push(`https://t.me/i/userpic/320/${username}.jpg`);
  }

  return [...new Set(sources)];
}
