import type { KeyboardEvent, MouseEvent } from 'react';
import { trackTelegramOpen } from '../api/opens';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { hapticSuccess, notifyUser, openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import { useAuth } from '../providers/AuthProvider';

interface ChannelQuickActionsProps {
  channelId: string;
  link: string | null | undefined;
  title?: string;
  /** 작게 (홈 피드 카드 등) */
  compact?: boolean;
}

/**
 * 목록 카드 오른쪽의 [☆ 즐겨찾기] [바로가기] 버튼.
 * 바로가기는 텔레그램의 그 방으로 바로 연다(미니앱이면 텔레그램 안에서).
 * 카드 클릭(상세로 이동)과 겹치지 않게 이벤트를 막는다.
 */
export function ChannelQuickActions({ channelId, link, title, compact = false }: ChannelQuickActionsProps) {
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
    <div className={`flex shrink-0 items-center self-center ${compact ? 'gap-1' : 'gap-1.5'}`} onKeyDown={stop}>
      {/* 즐겨찾기 안 한 방만 노란 별. 이미 즐겨찾기한 방은 별을 숨긴다(해제는 즐겨찾기 탭에서) */}
      {!favorited && (
        <button
          type="button"
          onClick={(event) => void onFavorite(event)}
          aria-label={`${title ?? ''} 즐겨찾기 추가`}
          className={`nl-orb-star flex items-center justify-center rounded-full leading-none ${compact ? 'h-6 w-6 text-[11px]' : 'h-9 w-9 text-[16px]'}`}
        >
          <span aria-hidden>⭐</span>
        </button>
      )}
      {link && (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`${title ?? ''} 텔레그램에서 바로가기`}
          className={`nl-orb-tg flex items-center justify-center rounded-full text-white ${compact ? 'h-6 w-6' : 'h-9 w-9'}`}
        >
          <svg viewBox="0 0 24 24" className={compact ? '-ml-px h-3 w-3' : '-ml-0.5 h-4 w-4'} fill="currentColor" aria-hidden>
            <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
          </svg>
        </button>
      )}
    </div>
  );
}
