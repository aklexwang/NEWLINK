import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InitialAvatar } from '../components/InitialAvatar';
import { isBlankAvatarImage } from '../utils/avatarFallback';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { searchChannels } from '../api/channels';
import {
  getHomeDashboard,
  getHomeFeed,
  getPostPreview,
  type HomeDashboard,
  type HomeFeedItem,
  type PostPreview,
} from '../api/stats';
import { ChannelList } from '../components/ChannelList';
import { PublicPrivateBadge } from '../components/PublicPrivateBadge';
import { BannerCarousel } from '../components/BannerCarousel';
import { getBanners, type PublicBanner } from '../api/ads';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import { trackTelegramOpen } from '../api/opens';
import { channelDetailPath } from '../utils/channelDetailPath';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../providers/ThemeProvider';
import type { Channel } from '../types/channel';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { formatRelativeKo } from '../utils/formatCount';
import { formatDeltaLine, formatMembers, resolveMemberDelta } from '../utils/memberDisplay';
import { BLOCKED_SEARCH_MESSAGE } from '../utils/searchMessage';

type HomeView = 'dash' | 'search';
type SearchType = 'all' | 'channel' | 'group';
type FeedType = 'channel' | 'all' | 'group';

const SUGGEST_LIMIT = 8;
const SUGGEST_DEBOUNCE_MS = 200;


function Avatar({
  channel,
  size = 'md',
}: {
  channel: { avatarUrl?: string | null; link: string; title: string };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'thread';
}) {
  const sources = useMemo(() => getChannelAvatarSources(channel), [channel]);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : sources[i];
  const box =
    size === 'lg'
      ? 'h-14 w-14 rounded-2xl'
      : size === 'sm'
        ? 'h-7 w-7 rounded-lg'
        : size === 'xs'
          ? 'h-[22px] w-[22px] rounded-full'
          : size === 'thread'
            ? 'h-9 w-9 rounded-full'
            : 'h-11 w-11 rounded-full';
  return (
    <div className={`${box} shrink-0 overflow-hidden bg-nl-elev ring-1 ring-nl-line`}>
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onLoad={(event) => {
            if (!isBlankAvatarImage(event.currentTarget)) return;
            if (i + 1 < sources.length) setI((n) => n + 1);
            else setFailed(true);
          }}
          onError={() => {
            // 모든 주소가 실패하면 깨진 그림 대신 머리글자
            if (i + 1 < sources.length) setI((n) => n + 1);
            else setFailed(true);
          }}
        />
      ) : (
        <InitialAvatar title={channel.title} seed={channel.link} textClass={
            size === 'lg'
              ? 'text-[18px]'
              : size === 'sm' || size === 'thread'
                ? 'text-[11px]'
                : size === 'xs'
                  ? 'text-[8px]'
                  : 'text-[15px]'
          } />
      )}
    </div>
  );
}

export function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { webApp, isLocalBrowser } = useTelegram();
  const { user, status: authStatus } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { searchCategories } = useCategories();
  const { recommendedIds, load: loadRecommended, recommend } = useMyRecommendations();
  const { favoriteIds, load: loadFavoriteIds, toggleFavorite } = useMyFavorites();
  // 홈 배너 광고(텔레그램 방 광고 아이콘 줄 대신)
  const [bannerAds, setBannerAds] = useState<{ rotateSeconds: number; banners: PublicBanner[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBanners()
      .then((data) => {
        if (!cancelled) setBannerAds(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [view, setView] = useState<HomeView>('dash');
  const [searchChannelsList, setSearchChannelsList] = useState<Channel[]>([]);
  /** 검색 결과 전체 개수와 더 보기용 다음 페이지 */
  const [searchTotal, setSearchTotal] = useState<number | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchMoreLoading, setSearchMoreLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Channel[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  /** 금지어로 막힌 검색일 때 서버가 준 안내 문구 (검색 결과 화면) */
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  /** 입력 중 자동완성이 금지어에 걸렸을 때 안내 문구 */
  const [suggestBlockedMessage, setSuggestBlockedMessage] = useState<string | null>(null);
  const suggestRequestId = useRef(0);

  const [home, setHome] = useState<HomeDashboard | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  /** 헤더 돋보기를 누르면 검색창이 열린다 */
  const [searchOpen, setSearchOpen] = useState(false);
  /** 맨 위 한 줄: 이번 주 상위 채널을 1위부터 돌아가며 보여 준다 */
  const [topIndex, setTopIndex] = useState(0);

  // 홈 피드는 채널만 (그룹은 글을 저장하지 않아 보여 줄 글이 없음)
  const feedType: FeedType = 'channel';
  const [feed, setFeed] = useState<HomeFeedItem[]>([]);
  const [feedCursor, setFeedCursor] = useState<string | null>(null);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedMore, setFeedMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);

  const resetToHome = useCallback(() => {
    setQuery('');
    setSearchChannelsList([]);
    setSuggestions([]);
    setShowSuggestions(false);
    setBlockedMessage(null);
    setSuggestBlockedMessage(null);
    setSearchOpen(false);
    setView('dash');
  }, []);

  const closeSuggestions = useCallback(() => setShowSuggestions(false), []);
  /** 자동완성에서 고른 글자는 다시 자동완성을 띄우지 않는다 */
  const skipSuggestFor = useRef<string | null>(null);

  const loadSearch = useCallback(
    // record=false 는 추천 후 목록 새로고침처럼 사용자가 새로 검색한 게 아닌 경우
    async (keyword: string, record = true) => {
      setSearchLoading(true);
      setShowSuggestions(false);
      try {
        const result = await searchChannels({
          q: keyword,
          type: searchType === 'all' ? undefined : searchType,
          record,
        });
        setSearchChannelsList(result.items);
        setSearchTotal(result.blocked ? 0 : result.total ?? result.items.length);
        setSearchPage(result.page ?? 1);
        setSearchTotalPages(result.totalPages ?? 1);
        setSearchKeyword(keyword);
        setBlockedMessage(result.blocked ? result.message ?? BLOCKED_SEARCH_MESSAGE : null);
        setView('search');
      } catch {
        notifyUser(webApp, isLocalBrowser, '검색 결과를 불러오지 못했습니다.');
        setSearchChannelsList([]);
        setSearchTotal(null);
        setBlockedMessage(null);
        setView('search');
      } finally {
        setSearchLoading(false);
      }
    },
    [webApp, isLocalBrowser, searchType],
  );

  const loadMoreSearch = useCallback(async () => {
    if (searchMoreLoading || searchPage >= searchTotalPages || !searchKeyword) return;
    setSearchMoreLoading(true);
    try {
      const result = await searchChannels({
        q: searchKeyword,
        type: searchType === 'all' ? undefined : searchType,
        page: searchPage + 1,
      });
      setSearchChannelsList((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        return [...prev, ...result.items.filter((c) => !seen.has(c.id))];
      });
      setSearchPage(result.page ?? searchPage + 1);
      setSearchTotalPages(result.totalPages ?? searchTotalPages);
    } catch {
      notifyUser(webApp, isLocalBrowser, '검색 결과를 더 불러오지 못했습니다.');
    } finally {
      setSearchMoreLoading(false);
    }
  }, [searchMoreLoading, searchPage, searchTotalPages, searchKeyword, searchType, webApp, isLocalBrowser]);

  useEffect(() => {
    const resetAt = (location.state as { homeResetAt?: number } | null)?.homeResetAt;
    if (!resetAt) return;
    resetToHome();
  }, [location.state, resetToHome]);

  useEffect(() => {
    const keyword = query.trim();
    if (skipSuggestFor.current !== null && skipSuggestFor.current === keyword) {
      skipSuggestFor.current = null;
      suggestRequestId.current += 1;
      setSuggestionsLoading(false);
      setShowSuggestions(false);
      return;
    }
    skipSuggestFor.current = null;
    if (!keyword) {
      suggestRequestId.current += 1;
      setSuggestions([]);
      setSuggestBlockedMessage(null);
      setSuggestionsLoading(false);
      setShowSuggestions(false);
      return;
    }
    setShowSuggestions(true);
    setSuggestionsLoading(true);
    const requestId = ++suggestRequestId.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await searchChannels({
            q: keyword,
            type: searchType === 'all' ? undefined : searchType,
          });
          if (requestId !== suggestRequestId.current) return;
          setSuggestions(result.items.slice(0, SUGGEST_LIMIT));
        } catch {
          if (requestId !== suggestRequestId.current) return;
          setSuggestions([]);
        } finally {
          if (requestId === suggestRequestId.current) setSuggestionsLoading(false);
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, searchType]);

  useEffect(() => {
    let cancelled = false;
    setHomeLoading(true);
    void getHomeDashboard()
      .then((data) => {
        if (!cancelled) setHome(data);
      })
      .catch(() => {
        if (!cancelled) setHome(null);
      })
      .finally(() => {
        if (!cancelled) setHomeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFeed = useCallback(
    async (reset: boolean) => {
      if (reset) setFeedLoading(true);
      else setFeedMore(true);
      try {
        const page = await getHomeFeed({
          type: feedType,
          cursor: reset ? undefined : feedCursor ?? undefined,
          limit: 20,
        });
        setFeed((prev) => (reset ? page.items : [...prev, ...page.items]));
        setFeedCursor(page.nextCursor);
      } catch {
        if (reset) setFeed([]);
      } finally {
        setFeedLoading(false);
        setFeedMore(false);
      }
    },
    [feedType, feedCursor],
  );

  useEffect(() => {
    setFeed([]);
    setFeedCursor(null);
    void (async () => {
      setFeedLoading(true);
      try {
        const page = await getHomeFeed({ type: feedType, limit: 20 });
        setFeed(page.items);
        setFeedCursor(page.nextCursor);
      } catch {
        setFeed([]);
      } finally {
        setFeedLoading(false);
      }
    })();
  }, [feedType]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !feedCursor) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !feedMore && !feedLoading) {
          void loadFeed(false);
        }
      },
      { rootMargin: '120px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [feedCursor, feedMore, feedLoading, loadFeed]);

  // 돋보기로 검색창을 열면 바로 입력할 수 있게 커서를 넣는다
  useEffect(() => {
    if (!searchOpen) return;
    const input = document.querySelector<HTMLInputElement>('#search-section input[type="text"], #search-section input:not([type])');
    input?.focus();
  }, [searchOpen]);

  const topChannels = useMemo(() => (home?.topChannels ?? []).slice(0, 5), [home]);
  useEffect(() => {
    if (topChannels.length < 2) return;
    const t = window.setInterval(() => {
      setTopIndex((i) => (i + 1) % topChannels.length);
    }, 4000);
    return () => window.clearInterval(t);
  }, [topChannels.length]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim() && view === 'search') {
      resetToHome();
      return;
    }
    if (value.trim()) setShowSuggestions(true);
  };


  const handleSearch = () => {
    const keyword = query.trim();
    if (!keyword) {
      resetToHome();
      return;
    }
    void loadSearch(keyword);
  };

  const handleSelectSuggestion = (channel: Channel) => {
    skipSuggestFor.current = channel.title.trim();
    setShowSuggestions(false);
    setQuery(channel.title);
    void loadSearch(channel.title);
  };

  const handleRecommend = async (id: string) => {
    if (recommendedIds.has(id)) {
      notifyUser(webApp, isLocalBrowser, '이미 추천한 채널/그룹입니다.');
      return;
    }
    try {
      await recommend(id);
      await loadSearch(query.trim(), false);
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notifyUser(webApp, isLocalBrowser, '이미 추천했거나 추천 처리에 실패했습니다.');
      await loadRecommended();
    }
  };

  const handleToggleFavorite = async (id: string) => {
    if (authStatus === 'loading') return;
    if (!isLoggedIn) {
      notifyUser(webApp, isLocalBrowser, '즐겨찾기는 회원 로그인 후 이용할 수 있습니다.');
      navigate('/my');
      return;
    }
    try {
      await toggleFavorite(id);
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notifyUser(webApp, isLocalBrowser, '즐겨찾기 변경에 실패했습니다.');
      await loadFavoriteIds();
    }
  };

  const goChannel = (item: { id?: string; username: string | null; link?: string }) => {
    const path = channelDetailPath({
      id: item.id,
      username: item.username,
      link: item.link,
    });
    if (path) navigate(path);
  };

  const searchBarProps = {
    value: query,
    onChange: handleQueryChange,
    onSearch: handleSearch,
    isLoading: searchLoading,
    variant: 'dashboard' as const,
    placeholder: '채널 이름, @아이디, t.me 링크',
    linkType: searchType,
    onLinkTypeChange: setSearchType,
    suggestions,
    suggestionsLoading,
    blockedMessage: suggestBlockedMessage,
    showSuggestions,
    onSelectSuggestion: handleSelectSuggestion,
    onCloseSuggestions: closeSuggestions,
  };

  const header = (
    <header className="sticky top-0 z-30 bg-nl-bg/95 backdrop-blur-md">
      <div className="relative flex h-[52px] items-center justify-center px-2">
        <button
          type="button"
          onClick={() => navigate('/my')}
          className="absolute left-3 h-8 rounded-lg px-3 text-[13px] font-bold text-nl-text ring-1 ring-nl-line"
        >
          {isLoggedIn ? 'MY' : '로그인'}
        </button>
        <button type="button" onClick={resetToHome} aria-label="홈" className="text-[20px] font-black tracking-[-0.5px] text-nl-text">
          TellLink
        </button>
        <div className="absolute right-1 flex items-center">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-11 w-10 items-center justify-center text-nl-text"
            aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          >
            {theme === 'dark' ? (
              <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden>
                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => (view === 'search' ? resetToHome() : setSearchOpen((v) => !v))}
            className="flex h-11 w-10 items-center justify-center text-nl-text"
            aria-label={searchOpen || view === 'search' ? '검색 닫기' : '검색'}
            aria-expanded={searchOpen || view === 'search'}
          >
            {searchOpen || view === 'search' ? (
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {(searchOpen || view === 'search') && (
        <div className="px-4 pb-3">
          <SearchBar {...searchBarProps} />
        </div>
      )}
    </header>
  );

  if (view === 'search') {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-nl-bg">
        {header}
        <ChannelList
          channels={searchChannelsList}
          isLoading={searchLoading}
          recommendedIds={recommendedIds}
          favoriteIds={favoriteIds}
          categoryEmojis={searchCategories}
          onRecommend={handleRecommend}
          onToggleFavorite={handleToggleFavorite}
          sectionTitle="검색 결과"
          totalCount={searchLoading || blockedMessage ? undefined : searchTotal ?? undefined}
          footer={
            !searchLoading && searchPage < searchTotalPages ? (
              <div className="px-4 pt-2">
                <button
                  type="button"
                  disabled={searchMoreLoading}
                  onClick={() => void loadMoreSearch()}
                  className="h-12 w-full rounded-2xl bg-nl-card text-[15px] font-semibold text-nl-text ring-1 ring-nl-line disabled:opacity-60"
                >
                  {searchMoreLoading
                    ? '불러오는 중…'
                    : `더 보기 (${searchChannelsList.length.toLocaleString('ko-KR')} / ${(searchTotal ?? 0).toLocaleString('ko-KR')})`}
                </button>
              </div>
            ) : undefined
          }
          emptyMessage={blockedMessage ?? '검색 결과가 없습니다.'}
          emptyBlocked={Boolean(blockedMessage)}
        />
      </div>
    );
  }


  const top = topChannels.length > 0 ? topChannels[topIndex % topChannels.length] : null;
  const topRank = top ? (topIndex % topChannels.length) + 1 : 0;
  const hasBanner = Boolean(bannerAds && bannerAds.banners.length > 0);
  // 배너는 피드 세 번째 글 다음에 한 칸으로 (글이 적으면 마지막 글 다음)
  const bannerAfter = Math.min(2, Math.max(0, feed.length - 1));
  const banner = hasBanner && bannerAds && (
    <div className="border-b border-nl-line px-4 py-3">
      <BannerCarousel banners={bannerAds.banners} rotateSeconds={bannerAds.rotateSeconds} />
    </div>
  );

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-nl-bg pb-4">
      {header}

      <nav aria-label="홈 메뉴" className="flex border-b border-nl-line">
        {HOME_TABS.map((tab) =>
          tab.to === '/' ? (
            <span
              key={tab.label}
              aria-current="page"
              className="-mb-px flex-1 border-b border-nl-text py-2.5 text-center text-[14px] font-bold text-nl-text"
            >
              {tab.label}
            </span>
          ) : (
            <Link
              key={tab.label}
              to={tab.to}
              className="flex-1 py-2.5 text-center text-[14px] font-medium whitespace-nowrap text-nl-muted"
            >
              {tab.label}
            </Link>
          ),
        )}
      </nav>

      {homeLoading ? (
        <div className="flex items-center gap-2.5 border-b border-nl-line px-4 py-3">
          <span className="h-4 w-16 animate-pulse rounded bg-nl-elev" />
          <span className="h-[22px] w-[22px] animate-pulse rounded-full bg-nl-elev" />
          <span className="h-4 flex-1 animate-pulse rounded bg-nl-elev" />
        </div>
      ) : top ? (
        <button
          type="button"
          onClick={() => goChannel(top)}
          className="flex w-full items-center gap-2.5 border-b border-nl-line px-4 py-3 text-left"
        >
          <span className="shrink-0 text-[12px] font-bold text-nl-muted">이번 주 {topRank}위</span>
          <span key={top.id} className="flex min-w-0 flex-1 items-center gap-2 nl-fade-in">
            <Avatar channel={top} size="xs" />
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-nl-text">{top.title}</span>
          </span>
          <span className="shrink-0 text-[12px] text-nl-muted">{formatMembers(top.memberCount)}</span>
        </button>
      ) : null}

      <section aria-label="최근 활발한 채널">
        {feedLoading && feed.length === 0
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-4 pt-3.5">
                <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-nl-elev" />
                <div className="flex-1 space-y-2 border-b border-nl-line pb-4">
                  <span className="block h-4 w-1/2 animate-pulse rounded bg-nl-elev" />
                  <span className="block h-4 w-full animate-pulse rounded bg-nl-elev" />
                  <span className="block h-32 w-full animate-pulse rounded-xl bg-nl-elev" />
                </div>
              </div>
            ))
          : feed.map((item, index) => (
              <Fragment key={item.id}>
                <ThreadItem
                  item={item}
                  onOpen={() => goChannel(item)}
                  favorite={favoriteIds.has(item.id)}
                  onToggleFavorite={() => void handleToggleFavorite(item.id)}
                />
                {index === bannerAfter && banner}
              </Fragment>
            ))}
        {!feedLoading && feed.length === 0 && (
          <>
            {banner}
            <p className="px-4 py-10 text-center text-[13px] text-nl-muted">최근 활동 기록이 있는 채널이 없습니다.</p>
          </>
        )}
        <div ref={sentinelRef} className="h-4" />
        {feedMore && <p className="py-2 text-center text-[12px] text-nl-muted">더 불러오는 중…</p>}
      </section>
    </div>
  );
}

/** 홈 위 탭: 피드는 이 화면, 나머지는 해당 화면으로 이동 */
const HOME_TABS = [
  { to: '/', label: '피드' },
  { to: '/ranking', label: '랭킹' },
  { to: '/ranking?sort=rising', label: '급상승' },
  { to: '/ranking?type=group', label: '그룹' },
  { to: '/weekly', label: '주간 변화' },
];

const MEDIA_LABEL: Record<string, string> = {
  photo: '사진 포함',
  video: '영상 포함',
  document: '파일 포함',
  audio: '음성 포함',
  poll: '투표',
  sticker: '스티커',
};

const MEDIA_ONLY_LABEL: Record<string, string> = {
  photo: '사진 게시글',
  video: '영상 게시글',
  document: '파일 게시글',
  audio: '음성 게시글',
  poll: '투표 게시글',
  sticker: '스티커',
};

function isIosDevice(webApp: { platform?: string }): boolean {
  try {
    if (webApp.platform === 'ios') return true;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return /iPhone|iPad|iPod/i.test(ua);
  } catch {
    return false;
  }
}

/**
 * 스레드형 피드 한 줄: 왼쪽 동그란 사진 + 세로선, 오른쪽 이름·글·사진·아래 줄.
 * 이름·사진을 누르면 채널 상세, 아래 줄 파란 텔레그램 버튼만 방으로 이동한다.
 */
function ThreadItem({
  item,
  onOpen,
  favorite,
  onToggleFavorite,
}: {
  item: HomeFeedItem;
  onOpen: () => void;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const { webApp, isLocalBrowser } = useTelegram();
  const post = item.latestPost ?? null;
  const deltaLine = formatDeltaLine(
    '7일',
    resolveMemberDelta(item.memberDelta7d, item.memberCount, item.growth7d),
  );
  const openRoom = () => {
    openTelegramChannel(webApp, isLocalBrowser, item.link);
    trackTelegramOpen(item.id);
  };
  // 아이폰은 텔레그램 게시글 상자(iframe)가 터치를 가로채서, 글·사진을 우리가 직접 그린다
  const ios = isIosDevice(webApp);
  const postUrl = post && item.username && !ios ? `https://t.me/${item.username}/${post.messageId}` : null;
  const ownPreview = Boolean(post && ios && item.username);
  const mediaLabel = post ? MEDIA_LABEL[post.mediaType] : undefined;

  return (
    <article className="flex gap-3 px-4 pt-3.5">
      <div className="flex shrink-0 flex-col items-center">
        <button type="button" onClick={onOpen} aria-label={`${item.title} 채널 정보`} className="rounded-full">
          <Avatar channel={item} size="thread" />
        </button>
        <span aria-hidden className="mt-2 w-0.5 flex-1 rounded-full bg-nl-line" />
      </div>
      <div className="min-w-0 flex-1 border-b border-nl-line pb-3.5">
        <button type="button" onClick={onOpen} className="flex max-w-full items-center gap-1.5 text-left">
          <span className="truncate text-[15px] font-bold text-nl-text">{item.title}</span>
          <PublicPrivateBadge link={item.link} />
          <span className="shrink-0 text-[13px] text-nl-muted">{formatRelativeKo(post?.postedAt ?? item.lastPostAt)}</span>
        </button>
        <p className="truncate text-[12px] text-nl-muted">
          {item.username ? `@${item.username} · ` : ''}
          {item.category}
        </p>

        {postUrl ? (
          <div className="mt-2">
            <TelegramPostEmbed url={postUrl} onOpenRoom={openRoom} title={item.title} />
          </div>
        ) : ownPreview ? (
          <OwnPostPreview item={item} />
        ) : post ? (
          <div className="mt-1">
            {post.text ? (
              <p className="line-clamp-6 whitespace-pre-line break-words text-[15px] leading-[1.5] text-nl-text">
                {post.text.replace(/\n{2,}/g, '\n').trim()}
              </p>
            ) : (
              <p className="text-[14px] text-nl-muted">{MEDIA_ONLY_LABEL[post.mediaType] ?? '글 내용 없는 게시글'}</p>
            )}
            {mediaLabel && post.text && <p className="mt-1 text-[12px] text-nl-muted">{mediaLabel}</p>}
          </div>
        ) : (
          <p className="mt-1 text-[14px] text-nl-muted">
            {item.activityKind === 'members' ? '인원 수가 바뀌었어요' : '새 게시글이 올라왔어요'}
          </p>
        )}

        <div className="mt-3 flex items-center gap-4 text-[13px] text-nl-muted">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-pressed={favorite}
            aria-label={favorite ? `${item.title} 즐겨찾기 해제` : `${item.title} 즐겨찾기 추가`}
            className="-m-2 flex h-9 w-9 items-center justify-center"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-[21px] w-[21px] ${favorite ? 'text-amber-400' : 'text-nl-text'}`}
              fill={favorite ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
            </svg>
          </button>
          {post?.views != null && <span>조회 {post.views.toLocaleString('ko-KR')}</span>}
          <span className="min-w-0 truncate">
            {formatMembers(item.memberCount)}
            {deltaLine ? ` · ${deltaLine}` : ''}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={openRoom}
            aria-label={`${item.title} 텔레그램에서 열기`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2AABEE] text-white"
          >
            <svg viewBox="0 0 24 24" className="-ml-px h-[15px] w-[15px]" fill="currentColor" aria-hidden>
              <path d={TG_PATH} />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}

const TG_PATH =
  'M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z';

/**
 * 아이폰용 게시글 미리보기: 서버가 텔레그램 공개 글에서 읽은 글·사진을 우리 화면에 그린다.
 * 링크가 하나도 없어서 어디를 눌러도 이동하지 않는다(방 이동은 아래 줄 텔레그램 버튼만).
 */
function OwnPostPreview({ item }: { item: HomeFeedItem }) {
  const post = item.latestPost!;
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [preview, setPreview] = useState<PostPreview | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const el = boxRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getPostPreview(item.id, post.messageId)
      .then((data) => {
        if (alive) setPreview(data);
      })
      .catch(() => {
        if (alive) setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [visible, item.id, post.messageId]);

  const text = (preview?.text || post.text || '').replace(/\n{3,}/g, '\n\n').trim();
  const images = (preview?.images ?? []).filter((src) => !brokenImages.has(src)).slice(0, 4);
  const long = text.length > 220 || text.split('\n').length > 6;

  return (
    <div
      ref={boxRef}
      className="mt-1 select-none"
      // 글·사진 어디를 눌러도 상세 페이지·텔레그램으로 넘어가지 않게 막는다
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      {text ? (
        <p
          className={`whitespace-pre-line break-words text-[15px] leading-[1.5] text-nl-text ${
            expanded ? '' : 'line-clamp-6'
          }`}
        >
          {text}
        </p>
      ) : preview !== undefined && images.length === 0 ? (
        <p className="text-[14px] text-nl-muted">{MEDIA_ONLY_LABEL[post.mediaType] ?? '글 내용 없는 게시글'}</p>
      ) : null}
      {long && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-0.5 text-[13px] font-semibold text-nl-muted"
        >
          {expanded ? '접기' : '더 보기'}
        </button>
      )}

      {preview === undefined && post.mediaType !== 'text' ? (
        <div className="mt-2.5 h-48 w-full animate-pulse rounded-xl bg-nl-elev" />
      ) : images.length > 0 ? (
        <div
          className={`mt-2.5 grid gap-0.5 overflow-hidden rounded-xl ring-1 ring-nl-line ${
            images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {images.map((src, i) => (
            <div key={src} className={`relative ${images.length === 3 && i === 0 ? 'col-span-2' : ''}`}>
              <img
                src={src}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setBrokenImages((prev) => new Set(prev).add(src))}
                className={`pointer-events-none block w-full object-cover ${
                  images.length === 1 ? 'max-h-[420px]' : images.length === 3 && i === 0 ? 'h-48' : 'h-36'
                }`}
              />
              {preview?.hasVideo && i === 0 && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M7 4v16l13-8z" />
                    </svg>
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 텔레그램 공식 게시글 미리보기 (사진·영상·전체 글). 우리 서버에는 저장하지 않는다 */
function TelegramPostEmbed({ url, onOpenRoom, title }: { url: string; onOpenRoom: () => void; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://t.me' || event.source !== ref.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? (JSON.parse(event.data) as { event?: string; height?: number }) : null;
        if (data?.event === 'resize' && data.height) setHeight(Math.min(2000, Math.max(120, data.height)));
      } catch {
        // 다른 메시지는 무시
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    <div className="relative" onClick={(event) => event.stopPropagation()}>
      <iframe
        ref={ref}
        title="텔레그램 원본 게시글"
        src={`${url}?embed=1&userpic=false${dark ? '&dark=1' : ''}`}
        loading="lazy"
        tabIndex={-1}
        // 상자 안(로고·이름·링크)은 눌리지 않게: 텔레그램 웹으로 튀어 나가는 것 방지
        className="pointer-events-none w-full rounded-xl border-0"
        style={{ height }}
      />
      {/* 투명 덮개: 아이폰은 iframe 에 pointer-events-none 이 안 먹어 상자 어디를 눌러도 텔레그램 글로 이동했다.
          덮개가 터치를 먼저 받아 아무 일도 하지 않는다(로고 자리만 아래 버튼으로 연다) */}
      <div
        aria-hidden
        className="absolute inset-0 z-10 rounded-xl"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onTouchEnd={(event) => event.stopPropagation()}
      />
      {/* 상자 오른쪽 위 텔레그램 로고 자리: 누르면 이 방을 텔레그램 앱으로 연다 */}
      <button
        type="button"
        aria-label={`${title} 텔레그램에서 열기`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenRoom();
        }}
        className="absolute top-0 right-0 z-20 h-12 w-14 rounded-tr-xl"
      />
    </div>
  );
}
