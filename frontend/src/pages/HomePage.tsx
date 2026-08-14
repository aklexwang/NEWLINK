import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { searchChannels } from '../api/channels';
import { ChannelList } from '../components/ChannelList';
import { NewLinkLogo } from '../components/NewLinkLogo';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { useAuth } from '../providers/AuthProvider';
import { hapticSuccess, notifyUser, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';

type HomeView = 'landing' | 'search';

const SUGGEST_LIMIT = 8;
const SUGGEST_DEBOUNCE_MS = 200;

export function HomePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { webApp, isLocalBrowser } = useTelegram();
  const { user, status: authStatus } = useAuth();
  const { searchCategories } = useCategories();
  const { recommendedIds, load: loadRecommended, recommend } = useMyRecommendations();
  const { favoriteIds, load: loadFavoriteIds, toggleFavorite } = useMyFavorites();

  const [query, setQuery] = useState('');
  const [view, setView] = useState<HomeView>('landing');
  const [searchChannelsList, setSearchChannelsList] = useState<Channel[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Channel[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestRequestId = useRef(0);

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);

  const resetToHome = useCallback(() => {
    setQuery('');
    setSearchChannelsList([]);
    setSuggestions([]);
    setShowSuggestions(false);
    setView('landing');
  }, []);

  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false);
  }, []);

  const loadSearch = useCallback(
    async (keyword: string) => {
      setSearchLoading(true);
      setShowSuggestions(false);
      try {
        const result = await searchChannels({ q: keyword });
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
    [webApp, isLocalBrowser],
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
          // limit 쿼리는 배포된 API ValidationPipe에서 400을 내는 경우가 있어
          // 기본 검색 후 클라이언트에서 잘라 쓴다.
          const result = await searchChannels({ q: keyword });
          if (requestId !== suggestRequestId.current) return;
          setSuggestions(result.items.slice(0, SUGGEST_LIMIT));
        } catch {
          if (requestId !== suggestRequestId.current) return;
          setSuggestions([]);
        } finally {
          if (requestId === suggestRequestId.current) {
            setSuggestionsLoading(false);
          }
        }
      })();
    }, SUGGEST_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim() && view === 'search') {
      resetToHome();
      return;
    }
    if (value.trim()) {
      setShowSuggestions(true);
    }
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

  const searchBarProps = {
    value: query,
    onChange: handleQueryChange,
    onSearch: handleSearch,
    isLoading: searchLoading,
    variant: 'google' as const,
    suggestions,
    suggestionsLoading,
    showSuggestions,
    onSelectSuggestion: handleSelectSuggestion,
    onCloseSuggestions: closeSuggestions,
  };

  if (view === 'search') {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-white">
        <div className="sticky top-0 z-10 border-b border-black/[0.04] bg-white/95 px-4 pb-3 pt-4 backdrop-blur-md">
          <button type="button" onClick={resetToHome} className="mx-auto block" aria-label="홈으로">
            <NewLinkLogo compact />
          </button>
          <SearchBar {...searchBarProps} className="mt-2 max-w-none px-0" />
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

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-[12vh]">
        <NewLinkLogo />
        <SearchBar {...searchBarProps} className="mt-8 w-full" />
      </div>
    </div>
  );
}
