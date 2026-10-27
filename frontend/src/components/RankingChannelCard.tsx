import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackRankAdClick } from '../api/ranking';
import type { RankingChannel } from '../types/ranking';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { channelDetailPath } from '../utils/channelDetailPath';
import { formatPercent } from '../utils/formatCount';
import {
  deltaTone,
  formatDeltaLine,
  formatNumber,
  resolveMemberDelta,
} from '../utils/memberDisplay';
import { ChannelQuickActions } from './ChannelQuickActions';
import { GradeBadge } from './GradeBadge';
import { InitialAvatar } from './InitialAvatar';
import { isBlankAvatarImage } from '../utils/avatarFallback';
import { VerifiedBadge } from './VerifiedBadge';
import { Sparkline } from './Sparkline';

interface RankingChannelCardProps {
  /** 광고 자리면 null */
  rank: number | null;
  /** 순위 광고 자리면 광고 id (AD 표시·클릭 집계) */
  adId?: string;
  channel: RankingChannel;
  avatarUrl?: string | null;
  onOpen: () => void;
}

export function RankingChannelCard({ rank, adId, channel, avatarUrl, onOpen }: RankingChannelCardProps) {
  const navigate = useNavigate();
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  const isAd = Boolean(adId);
  // 7일 증감은 수집 7일 미만이면 값이 없어 표시를 숨긴다
  const delta7d = resolveMemberDelta(
    channel.memberDelta7d,
    channel.participantsCount,
    channel.growth7d,
  );
  // '7일 +812' 에서 숫자 부분만 보여 준다
  const deltaValue = formatDeltaLine('7일', delta7d)?.replace(/^7일\s*/, '') ?? null;
  const tone = deltaTone(delta7d);
  const growthClass =
    tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-red-500' : 'text-tg-text';
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

  const isGroup = channel.linkType === 'group';
  const handle = (channel.username ?? '').replace(/^@/, '');
  // 데이터 부족 배지는 등급 배지 옆 표시로 대신하고, 나머지 배지만 최대 3개
  const tags = (channel.badges ?? []).filter((badge) => badge.code !== 'low_data').slice(0, 3);
  const top3 = rank != null && rank <= 3;

  return (
    // 등급 배지가 버튼이라 카드는 button 이 아니라 role="link" 로 둔다 (버튼 안 버튼 방지)
    <article
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
      onClickCapture={() => {
        if (adId) trackRankAdClick(adId);
      }}
      className={`cursor-pointer overflow-hidden rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-transform active:scale-[0.99] ${
        isAd ? 'ring-2 ring-amber-400/70' : 'ring-1 ring-nl-line'
      }`}
    >
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="relative shrink-0">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-nl-elev ring-1 ring-nl-line">
            {currentSrc && !failed ? (
              <img
                src={currentSrc}
                alt=""
                referrerPolicy="no-referrer"
                onLoad={(event) => {
                  if (!isBlankAvatarImage(event.currentTarget)) return;
                  if (sourceIndex + 1 < avatarSources.length) setSourceIndex((index) => index + 1);
                  else setFailed(true);
                }}
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
              <InitialAvatar title={channel.title} seed={channel.link || channel.id} textClass="text-[18px]" />
            )}
          </div>
          {/* 순위 배지: 광고는 AD, 1~3위는 메달, 그 밖은 숫자 */}
          {isAd ? (
            <span className="absolute -top-1.5 -left-1.5 flex h-6 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-extrabold tracking-wide text-slate-900 shadow-sm ring-2 ring-nl-card">
              AD
            </span>
          ) : (
            <span
              className={`absolute -top-1.5 -left-1.5 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold tabular-nums shadow-sm ring-2 ring-nl-card ${
                top3 ? 'bg-nl-card text-[15px]' : 'bg-nl-text text-nl-card'
              }`}
            >
              {medal ?? rank}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="min-w-0 truncate text-[16px] font-bold leading-snug text-tg-text">{channel.title}</p>
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
          <p className="mt-0.5 truncate text-[12px] text-nl-muted">
            {[isGroup ? '그룹' : '채널', channel.category, handle ? `@${handle}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        <ChannelQuickActions channelId={channel.id} link={channel.link} title={channel.title} />
      </div>

      <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl bg-nl-bg px-3 py-2.5">
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
          <div className="min-w-0 text-center">
            <p className="text-[10px] text-nl-muted">{isGroup ? '멤버' : '회원'}</p>
            <p className="mt-0.5 truncate text-[14px] font-bold tabular-nums text-tg-text">
              {formatNumber(channel.participantsCount) || '—'}
            </p>
          </div>
          <div className="min-w-0 text-center">
            <p className="text-[10px] text-nl-muted">조회율</p>
            <p className="mt-0.5 truncate text-[14px] font-bold tabular-nums text-tg-text">
              {isGroup ? '—' : formatPercent(channel.viewRate ?? null)}
            </p>
          </div>
          <div className="min-w-0 text-center">
            <p className="text-[10px] text-nl-muted">7일 변화</p>
            <p className={`mt-0.5 truncate text-[14px] font-bold tabular-nums ${growthClass}`}>
              {deltaValue ?? '—'}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end border-l border-nl-line pl-2">
          <Sparkline values={channel.sparkline14 ?? []} />
          <span className="text-[9px] text-nl-muted">최근 2주</span>
        </div>
      </div>

      {(tags.length > 0 || lowData) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3.5">
          {tags.map((badge) => (
            <span
              key={badge.code}
              className="rounded-full bg-nl-accent/10 px-2 py-0.5 text-[11px] font-semibold text-nl-accent"
            >
              {badge.label}
            </span>
          ))}
          {lowData && (
            <span className="rounded-full bg-nl-bg px-2 py-0.5 text-[11px] text-nl-muted">
              데이터 모으는 중
            </span>
          )}
        </div>
      )}
    </article>
  );
}
