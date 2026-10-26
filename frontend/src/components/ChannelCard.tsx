import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackTelegramOpen } from '../api/opens';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { channelDetailPath } from '../utils/channelDetailPath';
import { linkTypeBadgeClass, linkTypeLabel } from '../utils/linkType';
import { CategoryIcon } from './CategoryIcon';
import { VerifiedBadge } from './VerifiedBadge';

interface ChannelCardProps {
  channel: Channel;
  emoji: string;
  iconUrl?: string | null;
  recommended?: boolean;
  favorited?: boolean;
  onRecommend?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  showFavorite?: boolean;
}

export function ChannelCard({
  channel,
  emoji,
  iconUrl,
  favorited = false,
  onToggleFavorite,
  showFavorite = true,
}: ChannelCardProps) {
  const navigate = useNavigate();
  const { webApp, isLocalBrowser } = useTelegram();
  const path = channelDetailPath(channel);
  const promoted = channel.isPromoted;
  const description = (channel.description ?? '').trim();
  const avatarSources = useMemo(
    () =>
      channel.avatarApproved
        ? getChannelAvatarSources({ avatarUrl: channel.avatarUrl, link: channel.link })
        : [],
    [channel.avatarApproved, channel.avatarUrl, channel.link],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarSrc = avatarSources[sourceIndex];
  const showChannelAvatar = Boolean(avatarSrc && !avatarFailed);

  useEffect(() => {
    setSourceIndex(0);
    setAvatarFailed(false);
  }, [channel.id, channel.avatarUrl, channel.link, avatarSources]);

  const openDetail = () => {
    if (path) navigate(path);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={openDetail}
        disabled={!path}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
      >
      {showChannelAvatar ? (
        <img
          src={avatarSrc}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => {
            if (sourceIndex + 1 < avatarSources.length) {
              setSourceIndex((index) => index + 1);
            } else {
              setAvatarFailed(true);
            }
          }}
          className={`h-12 w-12 shrink-0 rounded-full object-cover ${
            promoted ? 'ring-2 ring-amber-300' : 'ring-1 ring-black/5'
          }`}
        />
      ) : (
        <CategoryIcon
          emoji={emoji}
          iconUrl={iconUrl}
          size="lg"
          className={promoted ? 'bg-amber-100' : 'bg-tg-secondary'}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 truncate text-[16px] font-semibold leading-tight text-tg-text">{channel.title}</p>
          {channel.isVerified && <VerifiedBadge size="sm" />}
        </div>
        {description ? (
          <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-[13px] leading-snug text-tg-hint">{description}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>
            {linkTypeLabel(channel.linkType)}
          </span>
          {promoted && (
            <span className="rounded-md bg-tg-open-bg px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tg-link">
              AD
            </span>
          )}
        </div>
      </div>
      </button>

      <div className="flex shrink-0 items-center gap-1.5">
        {showFavorite && onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(channel.id)}
            aria-label={favorited ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-[16px] leading-none ring-1 ring-black/5 active:scale-95 ${
              favorited ? 'bg-amber-50 text-amber-500' : 'bg-tg-secondary text-tg-hint'
            }`}
          >
            {favorited ? '★' : '☆'}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            trackTelegramOpen(channel.id);
            openTelegramChannel(webApp, isLocalBrowser, channel.link);
          }}
          aria-label={`${channel.title} 텔레그램에서 바로가기`}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2AABEE] text-white active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="-ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
