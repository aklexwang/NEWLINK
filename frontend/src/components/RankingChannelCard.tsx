import { useEffect, useMemo, useState } from 'react';
import type { LinkType } from '../types/channel';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { linkTypeLabel } from '../utils/linkType';
import { CategoryBadge } from './CategoryBadge';

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString('ko-KR');
}

interface RankingChannelCardProps {
  rank: number;
  title: string;
  link: string;
  avatarUrl?: string | null;
  participantsCount: number;
  recommendCount: number;
  linkType: LinkType;
  username?: string | null;
  category?: string;
  categoryEmoji?: string;
  categoryIconUrl?: string | null;
  onOpen: () => void;
}

export function RankingChannelCard({
  rank,
  title,
  link,
  avatarUrl,
  participantsCount,
  recommendCount,
  linkType,
  username,
  category,
  categoryEmoji,
  categoryIconUrl,
  onOpen,
}: RankingChannelCardProps) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const statLabel =
    participantsCount > 0
      ? `구독자 ${formatCount(participantsCount)}`
      : `추천 ${recommendCount.toLocaleString('ko-KR')}`;

  const avatarSources = useMemo(
    () => getChannelAvatarSources({ avatarUrl, link }),
    [avatarUrl, link],
  );
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [link, avatarUrl, avatarSources]);

  const currentSrc = avatarSources[sourceIndex];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
    >
      <div className="flex w-8 shrink-0 items-center justify-center text-[15px] font-bold text-tg-hint">
        {medal ?? rank}
      </div>

      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tg-secondary ring-1 ring-black/5">
        {currentSrc ? (
          <img
            src={currentSrc}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => {
              if (sourceIndex + 1 < avatarSources.length) {
                setSourceIndex((index) => index + 1);
              }
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xl">{linkType === 'group' ? '👥' : '📢'}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold leading-tight text-tg-text">{title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {category && (
            <CategoryBadge
              name={category}
              emoji={categoryEmoji}
              iconUrl={categoryIconUrl}
            />
          )}
          <span className="truncate text-[13px] text-tg-hint">
            {statLabel}
            {username ? ` · ${username}` : ''}
            {' · '}
            {linkTypeLabel(linkType)}
          </span>
        </div>
      </div>

      <span className="shrink-0 rounded-full bg-tg-open-bg px-3 py-1.5 text-[14px] font-semibold text-tg-open-text">
        Open
      </span>
    </button>
  );
}
