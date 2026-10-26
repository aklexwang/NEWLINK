import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackTelegramOpen } from '../api/opens';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { channelDetailPath } from '../utils/channelDetailPath';
import {
  dataReliability,
  extractContacts,
  formatKoDate,
  formatSince,
} from '../utils/channelSummary';
import { linkTypeBadgeClass, linkTypeLabel } from '../utils/linkType';
import { formatMemberNumber } from '../utils/memberDisplay';
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

  const openDetail = () => {
    if (path) navigate(path);
  };
  const stop = (event: MouseEvent | KeyboardEvent) => event.stopPropagation();
  const openHandle = (event: MouseEvent, target: string) => {
    event.stopPropagation();
    openTelegramChannel(webApp, isLocalBrowser, `https://t.me/${target}`);
  };

  const createdShort = createdOn ? createdOn.replace(/년 |월 /g, '.').replace('일', '') : null;

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
              <CategoryIcon emoji={emoji || (isGroup ? '👥' : '📢')} iconUrl={iconUrl} size="md" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="min-w-0 truncate text-[16px] font-bold leading-snug text-tg-text">
                {channel.title}
              </p>
              {channel.isVerified && <VerifiedBadge size="sm" />}
            </div>
            {handle && <p className="truncate text-[12px] text-nl-muted">@{handle}</p>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {showFavorite && onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(channel.id)}
              aria-label={favorited ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-[17px] leading-none ring-1 ring-nl-line active:scale-95 ${
                favorited ? 'bg-amber-50 text-amber-500' : 'bg-nl-card text-nl-muted'
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
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-sm active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="-ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 text-[12px]">
        <span className="rounded-full bg-nl-bg px-2.5 py-1 font-semibold text-tg-text">
          {members ? `회원 ${members}` : '회원 수 미집계'}
        </span>
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
            <InfoCell label="아이디" value={handle ? `@${handle}` : '-'} mono />
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
          {path && (
            <button
              type="button"
              onClick={openDetail}
              className="mt-3 w-full rounded-xl bg-nl-card py-2.5 text-[13px] font-semibold text-nl-accent ring-1 ring-nl-line"
            >
              통계·순위 자세히 보기 →
            </button>
          )}
        </div>
      )}
    </article>
  );
}
