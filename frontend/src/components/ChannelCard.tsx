import { useEffect, useState } from 'react';
import type { Channel } from '../types/channel';
import { linkTypeBadgeClass, linkTypeLabel } from '../utils/linkType';
import { resolveMediaUrl } from '../utils/mediaUrl';
import { CategoryIcon } from './CategoryIcon';

interface ChannelCardProps {
  channel: Channel;
  emoji: string;
  iconUrl?: string | null;
  recommended: boolean;
  onRecommend: (id: string) => void;
}

export function ChannelCard({ channel, emoji, iconUrl, recommended, onRecommend }: ChannelCardProps) {
  const promoted = channel.isPromoted;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarSrc = resolveMediaUrl(channel.avatarUrl);
  const showChannelAvatar = Boolean(channel.avatarApproved && avatarSrc && !avatarFailed);

  useEffect(() => {
    setAvatarFailed(false);
  }, [channel.id, avatarSrc]);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {showChannelAvatar ? (
        <img
          src={avatarSrc}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setAvatarFailed(true)}
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
        <p className="truncate text-[16px] font-semibold leading-tight text-tg-text">{channel.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>
            {linkTypeLabel(channel.linkType)}
          </span>
          {promoted && (
            <span className="rounded-md bg-tg-open-bg px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tg-link">
              AD
            </span>
          )}
          <button
            type="button"
            onClick={() => onRecommend(channel.id)}
            disabled={recommended}
            className={`text-[13px] ${recommended ? 'text-tg-hint' : 'text-tg-link'}`}
          >
            {recommended ? '👍 추천됨' : `👍 ${channel.recommendCount}`}
          </button>
          <span className="text-[13px] text-tg-hint">· {channel.category}</span>
        </div>
      </div>

      <a
        href={channel.link}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-tg-open-bg px-4 py-1.5 text-[15px] font-semibold text-tg-open-text"
      >
        Open
      </a>
    </div>
  );
}