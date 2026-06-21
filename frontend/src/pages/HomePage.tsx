import { useCallback, useEffect, useState } from 'react';
import { getPromotedChannels, searchChannels } from '../api/channels';
import { ChannelList } from '../components/ChannelList';
import { PromotedShortcuts } from '../components/PromotedShortcuts';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, openTelegramChannel, useTelegram } from '../hooks/useTelegram';

type HomeView = 'promoted' | 'search';

function HomeLogo({ compact = false }: { compact?: boolean }) {
  return (
    <header className={`flex flex-col items-center ${compact ? 'pb-2' : ''}`}>
      <h1
        className={`select-none font-black uppercase leading-none ${
          compact
            ? 'pr-[0.18em] text-[20px] tracking-[0.18em]'
            : 'pr-[0.22em] text-[40px] tracking-[0.22em]'
        }`}
      >
        <span className="bg-gradient-to-br from-[#2b8fd9] via-tg-link to-[#155fa8] bg-clip-text text-transparent">
          NEW
        </span>
        <span className="text-[#202124]">LINK</span>
      </h1>
    </header>
  );
}

export function HomePage() {
  const { webApp, isLocalBrowser } = useTelegram();
  const { searchCategories } = useCategories();
  const { recommendedIds, load: loadRecommended, recommend } = useMyRecommendations();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [query, setQuery] = useState('');
  const [view, setView] = useState<HomeView>('promoted');
  const [promotedChannels, setPromotedChannels] = useState<Awaited<ReturnType<typeof getPromotedChannels>>>([]);
  const [searchChannelsList, setSearchChannelsList] = useState<Awaited<ReturnType<typeof getPromotedChannels>>>([]);
  const [promotedLoading, setPromotedLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadPromoted = useCallback(async () => {
    setPromotedLoading(true);
    try {
      const items = await getPromotedChannels();
      setPromotedChannels(items);
      setView('promoted');
    } catch {
      notifyUser(webApp, isLocalBrowser, 'Promoted 목록을 불러오지 못했습니다.');
      setPromotedChannels([]);
    } finally {
      setPromotedLoading(false);
    }
  }, [webApp, isLocalBrowser]);

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
      } finally {
        setSearchLoading(false);
      }
    },
    [webApp, isLocalBrowser],
  );

  useEffect(() => {
    void loadPromoted();
  }, [loadPromoted]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim() && view === 'search') {
      void loadPromoted();
    }
  };

  const handleSearch = () => {
    const keyword = query.trim();
    if (keyword) {
      void loadSearch(keyword);
      return;
    }
    void loadPromoted();
  };

  const handleRecommend = async (id: string) => {
    if (recommendedIds.has(id)) {
      notify('이미 추천한 채널/그룹입니다.');
      return;
    }
    try {
      await recommend(id);
      if (view === 'search') {
        await loadSearch(query.trim());
      } else {
        await loadPromoted();
      }
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notify('이미 추천했거나 추천 처리에 실패했습니다.');
      await loadRecommended();
    }
  };

  const handleOpenChannel = (link: string) => {
    openTelegramChannel(webApp, isLocalBrowser, link);
  };

  if (view === 'search') {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] flex-col">
        <div className="sticky top-0 z-10 border-b border-black/[0.04] bg-tg-bg/95 px-4 pb-3 pt-4 backdrop-blur-md">
          <HomeLogo compact />
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
      <div className="flex flex-1 flex-col items-center px-6 pb-12 pt-[15vh]">
        <HomeLogo />

        <SearchBar
          value={query}
          onChange={handleQueryChange}
          onSearch={handleSearch}
          isLoading={searchLoading}
          variant="google"
          className="mt-9 w-full"
        />

        <PromotedShortcuts
          channels={promotedChannels}
          categoryEmojis={searchCategories}
          isLoading={promotedLoading}
          onOpen={handleOpenChannel}
        />
      </div>
    </div>
  );
}
