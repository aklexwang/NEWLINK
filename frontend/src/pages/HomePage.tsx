import { useCallback, useEffect, useState } from 'react';
import { getPromotedChannels, searchChannels } from '../api/channels';
import { ChannelList } from '../components/ChannelList';
import { NewLinkLogo } from '../components/NewLinkLogo';
import { PromotedShortcuts } from '../components/PromotedShortcuts';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, openTelegramChannel, useTelegram } from '../hooks/useTelegram';

type HomeView = 'promoted' | 'search';

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
          <NewLinkLogo compact />
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
        <NewLinkLogo />

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

        <p className="mt-[3cm] text-center text-[13px] text-[#3c4043]">
          New Link 제공 언어:{' '}
          <button type="button" className="text-[#1a0dab] hover:underline">
            한국어
          </button>
          <span className="mx-2 text-[#dadce0]">|</span>
          <a href="/admin" className="text-[#1a0dab] hover:underline">
            관리자
          </a>
        </p>
      </div>
    </div>
  );
}
