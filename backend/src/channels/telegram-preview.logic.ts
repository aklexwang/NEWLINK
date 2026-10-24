import { isInviteOnlyLink } from './telegram-username';
import {
  isAllowedTelegramPageHost,
  isTelegramBotFileUrl,
} from './telegram-avatar.logic';
import {
  parseInviteLinkHtml,
  parsePublicUsernamePage,
} from '../stats/telegram-preview-html';

export type TelegramPreview = {
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  memberCount: number | null;
  kind: 'channel' | 'group' | null;
};

/** fetchPreview 입력은 t.me / telegram.me 만. 아니면 null. */
export function resolvePreviewRequestUrl(link: string): string | null {
  const trimmed = link.trim();
  if (!trimmed) return null;
  let normalized: string;
  if (/^https?:\/\//i.test(trimmed)) {
    normalized = trimmed;
  } else if (
    trimmed.startsWith('t.me/') ||
    trimmed.startsWith('telegram.me/')
  ) {
    normalized = `https://${trimmed}`;
  } else if (trimmed.startsWith('@')) {
    normalized = `https://t.me/${trimmed.slice(1)}`;
  } else {
    normalized = `https://t.me/${trimmed}`;
  }
  try {
    const parsed = new URL(normalized);
    if (!/^https?:$/i.test(parsed.protocol)) return null;
    if (!isAllowedTelegramPageHost(parsed.hostname)) return null;
    return normalized;
  } catch {
    return null;
  }
}

export function emptyTelegramPreview(): TelegramPreview {
  return {
    title: null,
    description: null,
    avatarUrl: null,
    memberCount: null,
    kind: null,
  };
}

export function safePreviewAvatarUrl(
  url: string | null | undefined,
): string | null {
  if (!url || isTelegramBotFileUrl(url)) return null;
  if (/telegram\.org\/img\/t_logo/i.test(url)) return null;
  return url;
}

export function telegramPreviewFromHtml(input: {
  html: string | null;
  status: number;
  finalUrl?: string | null;
  requestUrl: string;
}): TelegramPreview {
  if (!input.html || input.status >= 400) return emptyTelegramPreview();
  const isInvite =
    isInviteOnlyLink(input.requestUrl) ||
    isInviteOnlyLink(input.finalUrl ?? '');
  if (isInvite) {
    const parsed = parseInviteLinkHtml(input.html, input.finalUrl);
    if (parsed.expired) {
      return {
        ...emptyTelegramPreview(),
        title: parsed.title,
        kind: null,
      };
    }
    return {
      title: parsed.title,
      description: parsed.description,
      avatarUrl: safePreviewAvatarUrl(parsed.avatarUrl),
      memberCount: parsed.memberCount,
      kind: parsed.kind,
    };
  }
  const parsed = parsePublicUsernamePage(input.html);
  const kind =
    parsed.kind === 'channel' || parsed.kind === 'group' ? parsed.kind : null;
  return {
    title: parsed.title,
    description: parsed.description,
    avatarUrl: safePreviewAvatarUrl(parsed.avatarUrl),
    memberCount: parsed.memberCount,
    kind,
  };
}
