import { useCallback, useEffect, useState } from 'react';
import { searchChannels } from '../api/channels';
import { CategoryChips } from '../components/CategoryChips';
import { ChannelList } from '../components/ChannelList';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';

export function HomePage() {
  const { webApp, isLocalBrowser } = useTelegram();
  const { searchCategories } = useCategories();
  const { recommendedIds, load: loadRecommended, recommend } = useMyRecommendations();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchChannels = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await searchChannels({
        q: query.trim() || undefined,
        category: category || undefined,
      });
      setChannels(result.items);
    } catch {
      notify('목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [category, query]);

  useEffect(() => {
    fetchChannels();
  }, [category]);

  const handleRecommend = async (id: string) => {
    if (recommendedIds.has(id)) {
      notify('이미 추천한 채널/그룹입니다.');
      return;
    }
    try {
      await recommend(id);
      await fetchChannels();
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notify('이미 추천했거나 추천 처리에 실패했습니다.');
      await loadRecommended();
    }
  };

  return (
    <>
      <header className="flex items-center gap-1.5 px-4 pb-1 pt-5">
        <h1 className="text-[22px] font-bold tracking-tight text-tg-text">NEWLINK</h1>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tg-link text-[11px] font-bold text-white">✓</span>
      </header>

      <SearchBar value={query} onChange={setQuery} onSearch={fetchChannels} isLoading={isLoading} />

      <CategoryChips categories={searchCategories} selected={category} onSelect={setCategory} />

      <ChannelList
        channels={channels}
        isLoading={isLoading}
        recommendedIds={recommendedIds}
        categoryEmojis={searchCategories}
        onRecommend={handleRecommend}
      />
    </>
  );
}