import type { KeyboardEvent, MouseEvent } from 'react';
import { trackTelegramOpen } from '../api/opens';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { hapticSuccess, notifyUser, openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import { useAuth } from '../providers/AuthProvider';

interface ChannelQuickActionsProps {
  channelId: string;
  link: string | null | undefined;
  title?: string;
}

/**
 * 목록 카드 오른쪽의 [☆ 즐겨찾기] [바로가기] 버튼.
 * 바로가기는 텔레그램의 그 방으로 바로 연다(미니앱이면 텔레그램 안에서).
 * 카드 클릭(상세로 이동)과 겹치지 않게 이벤트를 막는다.
 */
export function ChannelQuickActions({ channelId, link, title }: ChannelQuickActionsProps) {
  const { webApp, isLocalBrowser } = useTelegram();
  const { status } = useAuth();
  const { favoriteIds, toggleFavorite, load } = useMyFavorites();
  const favorited = favoriteIds.has(channelId);

  const stop = (event: MouseEvent | KeyboardEvent) => {
    event.stopPropagation();
  };

  const onFavorite = async (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (status === 'loading') return;
    if (status !== 'authenticated') {
      notifyUser(webApp, isLocalBrowser, '즐겨찾기는 로그인 후 이용할 수 있어요. MY에서 로그인해 주세요.');
      return;
    }
    try {
      await toggleFavorite(channelId);
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notifyUser(webApp, isLocalBrowser, '즐겨찾기를 바꾸지 못했어요.');
      await load();
    }
  };

  const onOpen = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    if (!link) return;
    trackTelegramOpen(channelId);
    openTelegramChannel(webApp, isLocalBrowser, link);
  };

  return (
    <div className="flex shrink-0 items-center gap-1 self-center" onKeyDown={stop}>
      <button
        type="button"
        onClick={(event) => void onFavorite(event)}
        aria-pressed={favorited}
        aria-label={favorited ? `${title ?? ''} 즐겨찾기 해제` : `${title ?? ''} 즐겨찾기 추가`}
        className={`flex h-8 w-8 items-center justify-center rounded-full text-[16px] leading-none ring-1 ring-black/5 active:scale-95 ${
          favorited ? 'bg-amber-50 text-amber-500' : 'bg-tg-secondary text-tg-hint'
        }`}
      >
        {favorited ? '★' : '☆'}
      </button>
      {link && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${title ?? ''} 텔레그램에서 바로가기`}
          className="flex h-8 items-center gap-1 rounded-full bg-[#2AABEE] px-2.5 text-[12px] font-bold text-white active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
            <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
          </svg>
          바로가기
        </button>
      )}
    </div>
  );
}
