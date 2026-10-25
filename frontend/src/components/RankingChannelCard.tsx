import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RankingChannel } from '../types/ranking';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { channelDetailPath } from '../utils/channelDetailPath';
import { formatPercent } from '../utils/formatCount';
import {
  deltaTone,
  formatDeltaLine,
  formatMembers,
  resolveMemberDelta,
} from '../utils/memberDisplay';
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
  // 7일 증감은 수집 7일 미만이면 값이 없어 표시를 숨긴다
  const delta7d = resolveMemberDelta(
    channel.memberDelta7d,
    channel.participantsCount,
    channel.growth7d,
  );
  const deltaLine = formatDeltaLine('7일', delta7d);
  const tone = deltaTone(delta7d);
  const growthClass =
    tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-red-600' : 'text-tg-hint';
  const lowData = Boolean(channel.badges?.some((badge) => badge.code === 'low_data'));

  const openDetail = () => {
    const path = channelDetailPath(channel);
    if (path) navigate(path);
    else onOpen();
  };

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
    // 등급 배지가 버튼이라 카드는 button 이 아니라 role="link" 로 둔다 (버튼 안 버튼 방지)
    <div
      role="link"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetail();
        }
      }}
      className="flex w-full cursor-pointer items-start gap-2.5 px-4 py-3 text-left active:bg-black/[0.03]"
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
          <GradeBadge
            grade={channel.grade ?? null}
            size="sm"
            channelId={channel.id}
            linkType={channel.linkType}
            score={channel.score}
            lowData={lowData}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-tg-hint">
          <span>{formatMembers(channel.participantsCount)}</span>
          <span>조회율 {formatPercent(channel.viewRate)}</span>
          {deltaLine && <span className={growthClass}>{deltaLine}</span>}
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
    </div>
  );
}
