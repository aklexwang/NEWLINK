/** 공개 username이 있으면 /c/{username}, 없으면 /c/id/{uuid} */
export function channelDetailPath(input: {
  id?: string | null;
  username?: string | null;
  link?: string | null;
}): string | null {
  const fromName = input.username?.replace(/^@/, '').trim();
  if (fromName) return `/c/${encodeURIComponent(fromName)}`;
  const fromLink = input.link?.match(/t\.me\/([a-zA-Z0-9_]{4,})/i)?.[1];
  if (fromLink && fromLink !== 's' && fromLink !== 'joinchat' && fromLink !== 'c') {
    return `/c/${encodeURIComponent(fromLink)}`;
  }
  if (input.id) return `/c/id/${encodeURIComponent(input.id)}`;
  return null;
}

export function isInviteLink(link: string | null | undefined): boolean {
  if (!link?.trim()) return false;
  return /\/joinchat\//i.test(link) || /(?:t\.me|telegram\.me|telegram\.dog)\/\+/i.test(link);
}
