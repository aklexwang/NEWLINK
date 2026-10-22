import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-tg-hint">{description}</p>
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

      <div className="flex shrink-0 items-center gap-2">
        {showFavorite && onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(channel.id)}
            aria-label={favorited ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            className={`rounded-full px-2.5 py-1.5 text-[16px] leading-none ${
              favorited ? 'text-amber-500' : 'text-tg-hint'
            }`}
          >
            {favorited ? '★' : '☆'}
          </button>
        )}
        <a
          href={channel.link}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-tg-open-bg px-4 py-1.5 text-[15px] font-semibold text-tg-open-text"
        >
          Open
        </a>
      </div>
    </div>
  );
}
