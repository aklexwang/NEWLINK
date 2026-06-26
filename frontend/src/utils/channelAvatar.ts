import { resolveMediaUrl } from './mediaUrl';

export function extractTelegramUsername(link: string): string | null {
  const match = link.match(/t\.me\/([a-zA-Z0-9_]{4,})/i);
  if (!match) return null;
  const name = match[1];
  if (name === 's' || name === 'joinchat' || name.startsWith('+')) return null;
  return name;
}

export function getChannelAvatarSources(
  channel: { avatarUrl?: string | null; link: string },
  options?: { includeStoredAvatar?: boolean },
): string[] {
  const includeStoredAvatar = options?.includeStoredAvatar ?? true;
  const sources: string[] = [];

  if (includeStoredAvatar && channel.avatarUrl) {
    const resolved = resolveMediaUrl(channel.avatarUrl);
    if (resolved) sources.push(resolved);
  }

  const username = extractTelegramUsername(channel.link);
  if (username) {
    sources.push(`https://t.me/i/userpic/320/${username}.jpg`);
  }

  return [...new Set(sources)];
}
