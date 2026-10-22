import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { searchChannels } from '../api/channels';
import { getHomeDashboard, getHomeFeed, type HomeCard, type HomeDashboard, type HomeFeedItem } from '../api/stats';
import { ChannelList } from '../components/ChannelList';
import { GradeBadge } from '../components/GradeBadge';
import { NewLinkLogo } from '../components/NewLinkLogo';
import { PromotedShortcuts } from '../components/PromotedShortcuts';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, useTelegram } from '../hooks/useTelegram';
import { channelDetailPath } from '../utils/channelDetailPath';
import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../providers/ThemeProvider';
import type { Channel } from '../types/channel';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { formatCount, formatRelativeKo, formatSignedPercent } from '../utils/formatCount';

type HomeView = 'dash' | 'search';
type SearchType = 'all' | 'channel' | 'group';
type FeedType = 'channel' | 'all' | 'group';

const SUGGEST_LIMIT = 8;
const SUGGEST_DEBOUNCE_MS = 200;


function Avatar({
  channel,
}: {
  channel: { avatarUrl?: string | null; link: string; title: string };
}) {
  const sources = useMemo(() => getChannelAvatarSources(channel), [channel]);
  const [i, setI] = useState(0);
  const src = sources[i];
  return (
    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-nl-elev ring-1 ring-nl-line">
      {src ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => {
            if (i + 1 < sources.length) setI((n) => n + 1);
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[13px] font-bold text-nl-muted">
          {channel.title.slice(0, 1)}
        </div>
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

  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('all');
  const [view, setView] = useState<HomeView>('dash');
  const [searchChannelsList, setSearchChannelsList] = useState<Channel[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Channel[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestRequestId = useRef(0);

  const [home, setHome] = useState<HomeDashboard | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);
  const [weekOpen, setWeekOpen] = useState(false);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  const [feedType, setFeedType] = useState<FeedType>('channel');
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
    setView('dash');
  }, []);

  const closeSuggestions = useCallback(() => setShowSuggestions(false), []);

  const loadSearch = useCallback(
    async (keyword: string) => {
      setSearchLoading(true);
      setShowSuggestions(false);
      try {
        const result = await searchChannels({
          q: keyword,
          type: searchType === 'all' ? undefined : searchType,
        });
        setSearchChannelsList(result.items);
        setView('search');
      } catch {
        notifyUser(webApp, isLocalBrowser, '검색 결과를 불러오지 못했습니다.');
        setSearchChannelsList([]);
        setView('search');
      } finally {
        setSearchLoading(false);
      }
    },
    [webApp, isLocalBrowser, searchType],
  );

  useEffect(() => {
    const resetAt = (location.state as { homeResetAt?: number } | null)?.homeResetAt;
    if (!resetAt) return;
    resetToHome();
  }, [location.state, resetToHome]);

  useEffect(() => {
    const keyword = query.trim();
    if (!keyword) {
      suggestRequestId.current += 1;
      setSuggestions([]);
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
      await loadSearch(query.trim());
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
          className="flex h-9 shrink-0 items-center justify-center rounded-full bg-nl-card px-3 text-[13px] font-semibold ring-1 ring-nl-line"
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
          emptyMessage="검색 결과가 없습니다."
        />
      </div>
    );
  }

  const promotedAsChannels = (home?.promoted ?? []).map(
    (item): Channel => ({
      id: item.id,
      title: item.title,
      link: item.link,
      linkType: item.linkType,
      category: item.category,
      description: '',
      recommendCount: 0,
      status: 'active',
      isPromoted: true,
      promotedUntil: null,
      avatarUrl: item.avatarUrl,
      createdAt: '',
    }),
  );

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
          <p className="px-4 pt-1 text-[11px] text-nl-muted">점수 데이터가 부족해 구독자 순으로 보여 줍니다.</p>
        )}
        <div className="mt-2 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none">
          {homeLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 w-40 shrink-0 animate-pulse rounded-2xl bg-nl-card" />
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
          <QuickLink to="/ranking" label="랭킹" />
          <QuickLink to="/ranking?sort=rising" label="급상승" />
          <QuickLink to="/ranking?type=group" label="그룹" />
          <QuickLink to="/weekly" label="주간 변화" />
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="shrink-0 rounded-full bg-nl-card px-3 py-2 text-[12px] font-semibold ring-1 ring-nl-line"
          >
            더 보기
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

      {!homeLoading && promotedAsChannels.length > 0 && (
        <section className="px-4 pt-5">
          <h2 className="text-[15px] font-bold">광고 채널</h2>
          <div className="mt-3 rounded-2xl bg-nl-card px-3 py-4 ring-1 ring-nl-line">
            <PromotedShortcuts
              channels={promotedAsChannels}
              categoryEmojis={searchCategories}
              isLoading={false}
              onOpen={(channel) => {
                const path = channelDetailPath(channel);
                if (path) navigate(path);
              }}
            />
          </div>
        </section>
      )}

      <section className="px-4 pt-5">
        <h2 className="text-[15px] font-bold">최근 활발한 채널</h2>
        <div className="mt-2 flex gap-2">
          {(
            [
              ['channel', '채널만'],
              ['all', '그룹 포함'],
              ['group', '그룹만'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFeedType(id)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                feedType === id ? 'bg-nl-accent text-[#082016]' : 'bg-nl-card text-nl-muted ring-1 ring-nl-line'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {feedLoading && feed.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-nl-card" />
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
      className="shrink-0 rounded-full bg-nl-card px-3 py-2 text-[12px] font-semibold ring-1 ring-nl-line"
    >
      {label}
    </Link>
  );
}

function TopChip({ rank, item, onOpen }: { rank: number; item: HomeCard; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-[168px] shrink-0 items-center gap-2 rounded-2xl bg-nl-card px-2.5 py-2 text-left ring-1 ring-nl-line"
    >
      <span className="w-5 text-center text-[12px] font-bold text-nl-accent">{rank}</span>
      <Avatar channel={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold">{item.title}</span>
        <span className="text-[11px] text-nl-muted">
          {item.score != null ? `점수 ${item.score}` : `구독 ${formatCount(item.memberCount)}`}
        </span>
      </span>
    </button>
  );
}

function FeedCard({ item, onOpen }: { item: HomeFeedItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-2xl bg-nl-card px-3 py-2.5 text-left ring-1 ring-nl-line"
    >
      <Avatar channel={item} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold">{item.title}</span>
          <GradeBadge grade={item.grade} size="sm" />
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-nl-muted">
          {item.category} · 구독 {formatCount(item.memberCount)} · 7일 {formatSignedPercent(item.growth7d)}
        </span>
        <span className="text-[11px] text-nl-muted">
          {item.activityKind === 'members' ? '인원 수 갱신' : '게시글'} · {formatRelativeKo(item.lastPostAt)}
        </span>
      </span>
    </button>
  );
}
