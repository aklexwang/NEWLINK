import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackTelegramOpen } from '../api/opens';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import type { ChannelSummary } from '../api/stats';
import type { Channel } from '../types/channel';
import { extractTelegramUsername, getChannelAvatarSources } from '../utils/channelAvatar';
import { channelDetailPath, isInviteLink } from '../utils/channelDetailPath';
import {
  dataReliability,
  extractContacts,
  formatKoDate,
  formatSince,
} from '../utils/channelSummary';
import { linkTypeBadgeClass, linkTypeLabel } from '../utils/linkType';
import { formatPercent } from '../utils/formatCount';
import {
  deltaTone,
  formatDeltaLine,
  formatMemberNumber,
  formatNumber,
  resolveMemberDelta,
} from '../utils/memberDisplay';
import { GradeBadge } from './GradeBadge';
import { Sparkline } from './Sparkline';
import { InitialAvatar } from './InitialAvatar';
import { isBlankAvatarImage } from '../utils/avatarFallback';
import { VerifiedBadge } from './VerifiedBadge';

interface ChannelCardProps {
  channel: Channel;
  /** 순위·추이·글 수 요약. 불러오는 중이면 없음 */
  summary?: ChannelSummary;
  emoji: string;
  iconUrl?: string | null;
  recommended?: boolean;
  favorited?: boolean;
  onRecommend?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  showFavorite?: boolean;
  /** 즐겨찾기 목록: 별 대신 [해제] 버튼 */
  removeMode?: boolean;
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-nl-muted">{label}</p>
      <p className={`mt-0.5 truncate text-[13px] font-semibold text-tg-text ${mono ? 'font-mono tracking-tight' : ''}`}>
        {value}
      </p>
    </div>
  );
}

/**
 * 검색·즐겨찾기 목록 카드.
 * 한 줄 요약(개설일·회원 수·연락처) + [자세히 보기]로 펼치는 정보 + 즐겨찾기·바로가기.
 * 소개글 전체는 보여주지 않는다(상세 화면에서 본다).
 */
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 text-center">
      <p className="text-[10px] text-nl-muted">{label}</p>
      <p className={`mt-0.5 truncate font-bold tabular-nums ${tone ?? 'text-[14px] text-tg-text'}`}>{value}</p>
    </div>
  );
}

export function ChannelCard({
  channel,
  summary,
  favorited = false,
  onToggleFavorite,
  showFavorite = true,
  removeMode = false,
}: ChannelCardProps) {
  const navigate = useNavigate();
  const { webApp, isLocalBrowser } = useTelegram();
  const [open, setOpen] = useState(false);
  const path = channelDetailPath(channel);
  const promoted = channel.isPromoted;
  // 등록 때 승인한 사진이 없어도 텔레그램 프로필 사진(프록시 → userpic)을 차례로 시도한다
  const avatarSources = useMemo(
    () => getChannelAvatarSources({ avatarUrl: channel.avatarUrl, link: channel.link }),
    [channel.avatarUrl, channel.link],
  );
  const [sourceIndex, setSourceIndex] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarSrc = avatarSources[sourceIndex];
  const showChannelAvatar = Boolean(avatarSrc && !avatarFailed);

  useEffect(() => {
    setSourceIndex(0);
    setAvatarFailed(false);
  }, [channel.id, channel.avatarUrl, channel.link, avatarSources]);

  const handle = (channel.username ?? '').replace(/^@/, '');
  const contacts = useMemo(
    () => extractContacts(channel.description, handle),
    [channel.description, handle],
  );
  const members = formatMemberNumber(channel.memberCount);
  const createdOn = formatKoDate(channel.createdOn);
  const isGroup = channel.linkType === 'group';
  // @아이디가 없는 초대 링크 방: 텔레그램이 바깥에 글을 보여 주지 않는다
  const isInviteOnly =
    isInviteLink(channel.link) || (!handle && !extractTelegramUsername(channel.link ?? ''));
  // 수집 계정이 회원이라 글을 읽은 비공개 방은 숫자를 그대로 보여 준다
  const isPrivate = isInviteOnly && !(summary && summary.collectedPosts > 0);

  const openDetail = () => {
    if (path) navigate(path);
  };
  const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();
  const openHandle = (event: MouseEvent, target: string) => {
    event.stopPropagation();
    openTelegramChannel(webApp, isLocalBrowser, `https://t.me/${target}`);
  };

  const createdShort = createdOn ? createdOn.replace(/년 |월 /g, '.').replace('일', '') : null;
  const delta = resolveMemberDelta(
    summary?.memberDelta7d ?? null,
    channel.memberCount,
    summary?.growth7d ?? null,
  );
  const deltaLine = formatDeltaLine('7일', delta);
  const tone = deltaTone(delta);
  const collectedMonth = (() => {
    const at = channel.lastCollectedAt ? new Date(channel.lastCollectedAt) : null;
    if (!at || !Number.isFinite(at.getTime())) return null;
    const kst = new Date(at.getTime() + 9 * 3600_000);
    return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 집계`;
  })();
  const contentLine = [
    !isGroup && summary?.postsApprox ? `게시글 약 ${formatNumber(summary.postsApprox)}` : null,
    summary && summary.photos > 0 ? `사진 ${formatNumber(summary.photos)}` : null,
    summary && summary.videos > 0 ? `영상 ${formatNumber(summary.videos)}` : null,
    summary && summary.mentions > 0 ? `언급 ${formatNumber(summary.mentions)}방` : null,
  ].filter(Boolean);

  return (
    <article className="overflow-hidden rounded-[20px] bg-nl-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div
          role="link"
          tabIndex={0}
          onClick={openDetail}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter') openDetail();
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          {showChannelAvatar ? (
            <img
              src={avatarSrc}
              alt=""
              referrerPolicy="no-referrer"
              onLoad={(event) => {
                if (!isBlankAvatarImage(event.currentTarget)) return;
                if (sourceIndex + 1 < avatarSources.length) setSourceIndex((index) => index + 1);
                else setAvatarFailed(true);
              }}
              onError={() => {
                if (sourceIndex + 1 < avatarSources.length) {
                  setSourceIndex((index) => index + 1);
                } else {
                  setAvatarFailed(true);
                }
              }}
              className={`h-14 w-14 shrink-0 rounded-2xl object-cover ${
                promoted ? 'ring-2 ring-amber-300' : 'ring-1 ring-nl-line'
              }`}
            />
          ) : (
            <div
              className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-nl-line ${
                promoted ? 'bg-amber-100' : 'bg-nl-elev'
              }`}
            >
              <InitialAvatar title={channel.title} seed={channel.link || channel.id} textClass="text-[18px]" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 truncate text-[16px] font-bold leading-snug text-tg-text">
                {channel.title}
              </p>
              {channel.isVerified && <VerifiedBadge size="sm" />}
              <GradeBadge
                grade={summary?.grade ?? null}
                size="sm"
                channelId={channel.id}
                linkType={channel.linkType}
                score={summary?.score ?? null}
                observedDays={summary?.observedDays ?? null}
              />
            </div>
            {handle && <p className="truncate text-[12px] text-nl-muted">@{handle}</p>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {showFavorite && onToggleFavorite && removeMode && (
            <button
              type="button"
              onClick={() => onToggleFavorite(channel.id)}
              aria-label="즐겨찾기 해제"
              className="h-9 rounded-full px-3 text-[13px] font-semibold text-nl-muted ring-1 ring-nl-line active:scale-95"
            >
              해제
            </button>
          )}
          {/* 즐겨찾기 안 한 방만 노란 별. 이미 즐겨찾기한 방은 별을 숨긴다 */}
          {showFavorite && onToggleFavorite && !removeMode && !favorited && (
            <button
              type="button"
              onClick={() => onToggleFavorite(channel.id)}
              aria-label="즐겨찾기 추가"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-nl-card text-[17px] leading-none ring-1 ring-nl-line active:scale-95"
            >
              <span aria-hidden>⭐</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              trackTelegramOpen(channel.id);
              openTelegramChannel(webApp, isLocalBrowser, channel.link);
            }}
            aria-label={`${channel.title} 텔레그램에서 바로가기`}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-sm active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="-ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 text-[12px]">
        {createdShort && (
          <span className="rounded-full bg-nl-bg px-2.5 py-1 text-nl-muted">개설 {createdShort}</span>
        )}
        {contacts.map((contact) => (
          <button
            key={contact.handle}
            type="button"
            onClick={(event) => openHandle(event, contact.handle)}
            onKeyDown={stop}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-nl-elev px-2.5 py-1 text-tg-link ring-1 ring-nl-line"
          >
            <span aria-hidden>💬</span>
            {contact.label && <span className="text-nl-muted">{contact.label}</span>}
            <span className="truncate font-semibold">@{contact.handle}</span>
          </button>
        ))}
      </div>

      <div className="mx-4 mb-3 rounded-2xl bg-nl-bg px-3 py-2.5">
        <div className="grid grid-cols-4 gap-1">
          <Metric label={isGroup ? '멤버' : '회원'} value={formatNumber(channel.memberCount) || '-'} />
          <Metric
            label="조회"
            value={
              isPrivate ? '비공개' : isGroup ? '-' : formatNumber(summary?.medianViews7d ?? null) || '-'
            }
            tone={isPrivate ? 'text-[12px] leading-5 text-nl-muted' : undefined}
          />
          <Metric
            label="조회율"
            value={isPrivate ? '비공개' : isGroup ? '-' : formatPercent(summary?.viewRate ?? null)}
            tone={isPrivate ? 'text-[12px] leading-5 text-nl-muted' : undefined}
          />
          <Metric
            label="전체 순위"
            value={summary?.rank ? `${formatNumber(summary.rank)}위` : '-'}
            tone="text-[14px] text-nl-accent"
          />
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-nl-line pt-2">
          <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-nl-muted">
            {isPrivate && (
              <p className="truncate">🔒 비공개 {isGroup ? '그룹' : '채널'} · 글 정보는 가입해야 보여요</p>
            )}
            {(contentLine.length > 0 || deltaLine) && (
              <p className="truncate">
                {contentLine.join(' · ')}
                {deltaLine && (
                  <span
                    className={`${contentLine.length > 0 ? 'ml-1.5' : ''} font-semibold ${
                      tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-red-500' : ''
                    }`}
                  >
                    {deltaLine}
                  </span>
                )}
              </p>
            )}
            <p className="truncate">
              {[collectedMonth, `데이터 ${dataReliability(summary?.observedDays ?? channel.observedDays)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <Sparkline values={summary?.sparkline14 ?? []} />
            <span className="text-[9px] text-nl-muted">최근 2주</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-t border-nl-line px-4 py-2.5">
        <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(channel.linkType)}`}>
          {linkTypeLabel(channel.linkType)}
        </span>
        {channel.category && (
          <span className="rounded-md bg-nl-bg px-1.5 py-0.5 text-[11px] font-medium text-nl-muted">
            {channel.category}
          </span>
        )}
        {promoted && (
          <span className="rounded-md bg-tg-open-bg px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tg-link">
            AD
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="ml-auto flex items-center gap-0.5 text-[12px] font-semibold text-nl-accent"
        >
          {open ? '접기' : '자세히 보기'}
          <span className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
            ▾
          </span>
        </button>
      </div>

      {open && (
        <div className="border-t border-nl-line bg-nl-bg/60 p-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <InfoCell label="구분" value={isGroup ? '그룹' : '채널'} />
            <InfoCell
              label="텔레그램 ID"
              value={channel.telegramChatId != null ? String(channel.telegramChatId) : '-'}
              mono
            />
            <InfoCell
              label="아이디"
              value={handle ? `@${handle}` : isInviteOnly ? '🔒 비공개 초대방' : '-'}
              mono={Boolean(handle)}
            />
            <InfoCell label="개설일" value={createdOn ?? '-'} />
            <InfoCell label="처음 관측" value={formatSince(channel.firstObservedAt) ?? '-'} />
            <InfoCell label="마지막 갱신" value={formatKoDate(channel.lastCollectedAt) ?? '-'} />
            <InfoCell label="데이터 신뢰도" value={dataReliability(channel.observedDays)} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-nl-card px-3 py-2.5 text-center ring-1 ring-nl-line">
              <p className="text-[11px] text-nl-muted">{isGroup ? '멤버' : '회원'}</p>
              <p className="mt-0.5 text-[18px] font-bold tabular-nums text-tg-text">{members ?? '-'}</p>
            </div>
            <div className="rounded-xl bg-nl-card px-3 py-2.5 text-center ring-1 ring-nl-line">
              <p className="text-[11px] text-nl-muted">최근 7일 게시글</p>
              <p className="mt-0.5 text-[18px] font-bold tabular-nums text-tg-text">
                {isGroup ? '-' : (channel.posts7d ?? '-')}
              </p>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
