import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InitialAvatar } from '../components/InitialAvatar';
import { isBlankAvatarImage } from '../utils/avatarFallback';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { searchChannels } from '../api/channels';
import { getHomeDashboard, getHomeFeed, type HomeCard, type HomeDashboard, type HomeFeedItem } from '../api/stats';
import { ChannelList } from '../components/ChannelList';
import { GradeBadge } from '../components/GradeBadge';
import { NewLinkLogo } from '../components/NewLinkLogo';
import { BannerCarousel } from '../components/BannerCarousel';
import { getBanners, type PublicBanner } from '../api/ads';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { ChannelQuickActions } from '../components/ChannelQuickActions';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, useTelegram } from '../hooks/useTelegram';
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
  size?: 'md' | 'lg';
}) {
  const sources = useMemo(() => getChannelAvatarSources(channel), [channel]);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = failed ? undefined : sources[i];
  const box = size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-11 w-11 rounded-full';
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
        <InitialAvatar title={channel.title} seed={channel.link} textClass={size === 'lg' ? 'text-[18px]' : 'text-[15px]'} />
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
  const [weekOpen, setWeekOpen] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

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

  const headlines = useMemo(() => {
    if (!home) return [];
    const rows: string[] = [];
    if (home.headlines.risingTitle) {
      rows.push(`이번 주 급상승 1위 · ${home.headlines.risingTitle}`);
    }
    rows.push(`새로 관측된 채널 ${home.headlines.firstSeenCount.toLocaleString('ko-KR')}개`);
    rows.push(`순위 상승 ${home.headlines.rankUpCount.toLocaleString('ko-KR')}건`);
    return rows;
  }, [home]);

  useEffect(() => {
    if (headlines.length < 2) return;
    const t = window.setInterval(() => {
      setHeadlineIndex((i) => (i + 1) % headlines.length);
    }, 4000);
    return () => window.clearInterval(t);
  }, [headlines.length]);

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
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-nl-line bg-nl-bg/90 px-3 py-2 backdrop-blur-md">
      <button type="button" onClick={resetToHome} className="flex items-center" aria-label="홈">
        <NewLinkLogo compact />
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nl-card text-[16px] ring-1 ring-nl-line"
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {theme === 'dark' ? '🌞' : '🌙'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/my')}
          className={`nl-my-btn flex shrink-0 items-center justify-center rounded-full font-extrabold text-white ${isLoggedIn ? 'h-10 w-10 text-[13px]' : 'h-10 px-4 text-[14px]'}`}
        >
          {isLoggedIn ? 'MY' : '로그인'}
        </button>
      </div>
    </header>
  );

  if (view === 'search') {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-nl-bg">
        {header}
        <div className="px-4 pb-3 pt-3">
          <SearchBar {...searchBarProps} />
        </div>
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


  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-nl-bg pb-4">
      {header}

      <section className="px-4 pt-4">
        <div className="rounded-2xl bg-nl-card p-4 ring-1 ring-nl-line">
          <h1 className="text-[16px] font-bold leading-snug text-nl-text">
            텔레그램 채널·그룹 검색 · 통계 · 순위
          </h1>
          <SearchBar {...searchBarProps} className="mt-3" />
        </div>
      </section>

      <section className="px-4 pt-3">
        <div className="rounded-2xl bg-nl-card ring-1 ring-nl-line">
          <button
            type="button"
            onClick={() => setWeekOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
          >
            <span className="text-[11px] font-bold text-nl-accent">이번 주</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-nl-text">
              {homeLoading ? '불러오는 중…' : headlines[headlineIndex] || '아직 주간 소식이 없습니다.'}
            </span>
            <span className="text-nl-muted">{weekOpen ? '▴' : '▾'}</span>
          </button>
          {weekOpen && (
            <div className="space-y-2 border-t border-nl-line px-3 py-3 text-[13px]">
              {home?.headlines.risingTitle && (
                <p>
                  급상승 1위{' '}
                  <button
                    type="button"
                    className="font-semibold text-nl-accent"
                    onClick={() =>
                      goChannel({
                        id: home.headlines.risingId ?? undefined,
                        username: home.headlines.risingUsername,
                        link: home.headlines.risingLink ?? undefined,
                      })
                    }
                  >
                    {home.headlines.risingTitle}
                  </button>
                </p>
              )}
              <p className="text-nl-muted">새로 관측 {home?.headlines.firstSeenCount ?? 0}개</p>
              <ul className="space-y-1">
                {(home?.headlines.firstSeen ?? []).map((item) => (
                  <li key={`n-${item.id}`}>
                    <button type="button" className="text-nl-text" onClick={() => goChannel(item)}>
                      {item.title ?? item.username}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="pt-1 text-nl-muted">순위 상승 {home?.headlines.rankUpCount ?? 0}건</p>
              <ul className="space-y-1">
                {(home?.headlines.rankUp ?? []).map((item) => (
                  <li key={`r-${item.id}`}>
                    <button type="button" className="text-nl-text" onClick={() => goChannel(item)}>
                      {item.title ?? item.username}
                    </button>
                  </li>
                ))}
              </ul>
              {!home?.headlines.firstSeen.length && !home?.headlines.rankUp.length && (
                <p className="text-nl-muted">표시할 주간 목록이 없습니다.</p>
              )}
              <Link to="/weekly" className="inline-block pt-1 text-[12px] font-semibold text-nl-accent">
                주간 변화 전체
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="pt-4">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-[15px] font-bold">이번 주 상위 채널</h2>
          <Link to="/ranking" className="text-[12px] font-semibold text-nl-accent">
            전체 보기
          </Link>
        </div>
        {home?.topBy === 'members' && (
          <p className="px-4 pt-1 text-[11px] text-nl-muted">점수 데이터가 부족해 회원 수 순으로 보여 줍니다.</p>
        )}
        <div className="mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1 scrollbar-none">
          {homeLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-[150px] w-[132px] shrink-0 animate-pulse rounded-[20px] bg-nl-card" />
              ))
            : (home?.topChannels ?? []).map((item, index) => (
                <TopChip key={item.id} rank={index + 1} item={item} onOpen={() => goChannel(item)} />
              ))}
        </div>
        {!homeLoading && (home?.topChannels.length ?? 0) === 0 && (
          <p className="px-4 py-3 text-[13px] text-nl-muted">아직 상위 채널이 없습니다.</p>
        )}
      </section>

      <section className="relative px-4 pt-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          <QuickLink to="/ranking" label="🏆 랭킹" />
          <QuickLink to="/ranking?sort=rising" label="🚀 급상승" />
          <QuickLink to="/ranking?type=group" label="👥 그룹" />
          <QuickLink to="/weekly" label="📈 주간 변화" />
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="shrink-0 rounded-full bg-nl-card px-3.5 py-2 text-[13px] font-semibold ring-1 ring-nl-line"
          >
            ⋯ 더 보기
          </button>
        </div>
        {moreOpen && (
          <div className="absolute right-4 z-20 mt-2 w-40 rounded-xl bg-nl-card p-2 text-[13px] shadow-lg ring-1 ring-nl-line">
            <Link to="/compare" className="block rounded-lg px-2 py-2 hover:bg-nl-elev" onClick={() => setMoreOpen(false)}>
              비교
            </Link>
            <Link
              to="/ranking"
              className="block rounded-lg px-2 py-2 hover:bg-nl-elev"
              onClick={() => setMoreOpen(false)}
            >
              카테고리 랭킹
            </Link>
          </div>
        )}
      </section>

      {bannerAds && bannerAds.banners.length > 0 && (
        <section className="px-4 pt-5">
          <BannerCarousel banners={bannerAds.banners} rotateSeconds={bannerAds.rotateSeconds} />
        </section>
      )}

      <section className="px-4 pt-5">
        <h2 className="text-[15px] font-bold">최근 활발한 채널</h2>
        <div className="mt-3 space-y-3">
          {feedLoading && feed.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[180px] animate-pulse rounded-2xl bg-nl-card" />
              ))
            : feed.map((item) => (
                <FeedCard key={item.id} item={item} onOpen={() => goChannel(item)} />
              ))}
          {!feedLoading && feed.length === 0 && (
            <p className="rounded-2xl bg-nl-card px-4 py-6 text-center text-[13px] text-nl-muted ring-1 ring-nl-line">
              최근 활동 기록이 있는 채널이 없습니다.
            </p>
          )}
          <div ref={sentinelRef} className="h-4" />
          {feedMore && <p className="py-2 text-center text-[12px] text-nl-muted">더 불러오는 중…</p>}
        </div>
      </section>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="shrink-0 rounded-full bg-nl-card px-3.5 py-2 text-[13px] font-semibold ring-1 ring-nl-line active:scale-95"
    >
      {label}
    </Link>
  );
}

function TopChip({ rank, item, onOpen }: { rank: number; item: HomeCard; onOpen: () => void }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex w-[132px] shrink-0 flex-col items-center gap-2 rounded-[20px] bg-nl-card px-3 pt-4 pb-3 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line transition-transform active:scale-[0.98]"
    >
      <span
        className={`absolute top-2 left-2 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold ${
          medal ? 'text-[15px]' : 'bg-nl-elev text-nl-muted'
        }`}
      >
        {medal ?? rank}
      </span>
      <Avatar channel={item} size="lg" />
      <span className="line-clamp-2 min-h-[34px] w-full text-[13px] leading-[17px] font-bold">{item.title}</span>
      <span className="rounded-full bg-nl-elev px-2 py-0.5 text-[11px] font-semibold text-nl-muted">
        {item.score != null ? `점수 ${item.score}` : formatMembers(item.memberCount)}
      </span>
    </button>
  );
}

const MEDIA_LABEL: Record<string, string> = {
  photo: '📷 사진 포함',
  video: '🎬 영상 포함',
  document: '📎 파일 포함',
  audio: '🎵 음성 포함',
  poll: '📊 투표',
  sticker: '스티커',
};

const MEDIA_ONLY_LABEL: Record<string, string> = {
  photo: '📷 사진 게시글',
  video: '🎬 영상 게시글',
  document: '📎 파일 게시글',
  audio: '🎵 음성 게시글',
  poll: '📊 투표 게시글',
  sticker: '스티커',
};

function FeedCard({ item, onOpen }: { item: HomeFeedItem; onOpen: () => void }) {
  // 7일 증감은 수집 7일 미만이면 값이 없어 표시를 숨긴다
  const deltaLine = formatDeltaLine(
    '7일',
    resolveMemberDelta(item.memberDelta7d, item.memberCount, item.growth7d),
  );
  const post = item.latestPost ?? null;
  const [showOriginal, setShowOriginal] = useState(false);
  const postUrl = post && item.username ? `https://t.me/${item.username}/${post.messageId}` : null;
  const mediaLabel = post ? MEDIA_LABEL[post.mediaType] : undefined;
  return (
    // 등급 배지가 버튼이라 카드는 button 이 아니라 role="link" 로 둔다 (버튼 안 버튼 방지)
    <div
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      className="w-full cursor-pointer overflow-hidden rounded-[20px] bg-nl-card text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-nl-line"
    >
      <div className="flex items-center gap-3 px-3.5 pt-3 pb-2.5">
        <Avatar channel={item} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[14px] font-semibold">{item.title}</span>
            <GradeBadge
              grade={item.grade}
              size="sm"
              channelId={item.id}
              linkType={item.linkType}
              score={item.score}
            />
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-nl-muted">
            {item.username ? `@${item.username} · ` : ''}
            {item.category} · {formatMembers(item.memberCount)}
            {deltaLine ? ` · ${deltaLine}` : ''}
          </span>
        </span>
        <ChannelQuickActions channelId={item.id} link={item.link} title={item.title} />
      </div>

      {post ? (
        <div className="border-t border-nl-line px-4 pt-3 pb-3">
          {post.text ? (
            <p className="line-clamp-4 whitespace-pre-line text-[14px] leading-relaxed text-tg-text">
              {post.text.replace(/\n{2,}/g, '\n').trim()}
            </p>
          ) : (
            <p className="text-[13px] text-nl-muted">{MEDIA_ONLY_LABEL[post.mediaType] ?? '글 내용 없는 게시글'}</p>
          )}
          <div className="mt-2.5 flex items-center gap-2 text-[12px] text-nl-muted">
            {mediaLabel && post.text && (
              <span className="rounded-full bg-nl-elev px-2 py-0.5 ring-1 ring-nl-line">{mediaLabel}</span>
            )}
            {post.views != null && <span>👁 {post.views.toLocaleString('ko-KR')}</span>}
            <span>{formatRelativeKo(post.postedAt)}</span>
            {postUrl && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowOriginal((v) => !v);
                }}
                className="ml-auto rounded-full bg-tg-open-bg px-3 py-1 text-[12px] font-semibold text-tg-open-text"
              >
                {showOriginal ? '원본 닫기 ▴' : '원본 보기 ▾'}
              </button>
            )}
          </div>
          {showOriginal && postUrl && <TelegramPostEmbed url={postUrl} />}
        </div>
      ) : (
        <p className="border-t border-nl-line px-4 py-2.5 text-[11px] text-nl-muted">
          {item.activityKind === 'members' ? '인원 수 갱신' : '게시글'} · {formatRelativeKo(item.lastPostAt)}
        </p>
      )}
    </div>
  );
}

/** 텔레그램 공식 게시글 미리보기 (사진·영상·전체 글). 우리 서버에는 저장하지 않는다 */
function TelegramPostEmbed({ url }: { url: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(360);
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
    <div className="mt-3" onClick={(event) => event.stopPropagation()}>
      <iframe
        ref={ref}
        title="텔레그램 원본 게시글"
        src={`${url}?embed=1&userpic=false${dark ? '&dark=1' : ''}`}
        loading="lazy"
        className="w-full rounded-xl border-0"
        style={{ height }}
      />
    </div>
  );
}
