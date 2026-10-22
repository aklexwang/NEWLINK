import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RankingChannel } from '../types/ranking';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { channelDetailPath } from '../utils/channelDetailPath';
import { formatCount, formatPercent, formatSignedPercent } from '../utils/formatCount';
import { GradeBadge } from './GradeBadge';
import { VerifiedBadge } from './VerifiedBadge';
import { Sparkline } from './Sparkline';

interface RankingChannelCardProps {
  rank: number;
  channel: RankingChannel;
  avatarUrl?: string | null;
  onOpen: () => void;
}

export function RankingChannelCard({ rank, channel, avatarUrl, onOpen }: RankingChannelCardProps) {
  const navigate = useNavigate();
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const growth = channel.growth7d;
  const growthClass =
    growth == null ? 'text-tg-hint' : growth > 0 ? 'text-emerald-600' : growth < 0 ? 'text-red-600' : 'text-tg-hint';

  const avatarSources = useMemo(
    () => getChannelAvatarSources({ avatarUrl, link: channel.link }),
    [avatarUrl, channel.link],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [channel.link, avatarUrl, avatarSources]);

  const currentSrc = avatarSources[sourceIndex];

  return (
    <button
      type="button"
      onClick={() => {
        const path = channelDetailPath(channel);
        if (path) navigate(path);
        else onOpen();
      }}
      className="flex w-full items-start gap-2.5 px-4 py-3 text-left active:bg-black/[0.03]"
    >
      <div className="flex w-7 shrink-0 items-center justify-center pt-3 text-[13px] font-bold text-tg-hint">
        {medal ?? rank}
      </div>

      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-tg-secondary ring-1 ring-black/5">
        {currentSrc && !failed ? (
          <img
            src={currentSrc}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => {
              if (sourceIndex + 1 < avatarSources.length) {
                setSourceIndex((index) => index + 1);
              } else {
                setFailed(true);
              }
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-lg">{channel.linkType === 'group' ? '👥' : '📢'}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="min-w-0 truncate text-[15px] font-semibold leading-tight text-tg-text">{channel.title}</p>
          {channel.isVerified && <VerifiedBadge size="sm" />}
          <GradeBadge grade={channel.grade ?? null} size="sm" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-tg-hint">
          <span>구독 {formatCount(channel.participantsCount)}</span>
          <span>조회율 {formatPercent(channel.viewRate)}</span>
          <span className={growthClass}>7일 {formatSignedPercent(growth)}</span>
          <Sparkline values={channel.sparkline14 ?? []} />
        </div>
        {channel.badges && channel.badges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {channel.badges.map((badge) => (
              <span
                key={badge.code}
                className="rounded-full bg-tg-secondary px-1.5 py-0.5 text-[10px] font-medium text-tg-text"
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
