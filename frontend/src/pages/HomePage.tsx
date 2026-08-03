import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { searchChannels } from '../api/channels';
import { ChannelList } from '../components/ChannelList';
import { NewLinkLogo } from '../components/NewLinkLogo';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, useTelegram } from '../hooks/useTelegram';

type HomeView = 'landing' | 'search';

export function HomePage() {
  const location = useLocation();
  const { webApp, isLocalBrowser } = useTelegram();
  const { searchCategories } = useCategories();
  const { recommendedIds, load: loadRecommended, recommend } = useMyRecommendations();

  const [query, setQuery] = useState('');
  const [view, setView] = useState<HomeView>('landing');
  const [searchChannelsList, setSearchChannelsList] = useState<
    Awaited<ReturnType<typeof searchChannels>>['items']
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const resetToHome = useCallback(() => {
    setQuery('');
    setSearchChannelsList([]);
    setView('landing');
  }, []);

  const loadSearch = useCallback(
    async (keyword: string) => {
      setSearchLoading(true);
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

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim() && view === 'search') {
      resetToHome();
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

  if (view === 'search') {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-white">
        <div className="sticky top-0 z-10 border-b border-black/[0.04] bg-white/95 px-4 pb-3 pt-4 backdrop-blur-md">
          <button type="button" onClick={resetToHome} className="mx-auto block" aria-label="홈으로">
            <NewLinkLogo compact />
          </button>
          <SearchBar
            value={query}
            onChange={handleQueryChange}
            onSearch={handleSearch}
            isLoading={searchLoading}
            variant="google"
            className="mt-2 max-w-none px-0"
          />
        </div>

        <ChannelList
          channels={searchChannelsList}
          isLoading={searchLoading}
          recommendedIds={recommendedIds}
          categoryEmojis={searchCategories}
          onRecommend={handleRecommend}
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
        <SearchBar
          value={query}
          onChange={handleQueryChange}
          onSearch={handleSearch}
          isLoading={searchLoading}
          variant="google"
          className="mt-8 w-full"
        />
      </div>
    </div>
  );
}
