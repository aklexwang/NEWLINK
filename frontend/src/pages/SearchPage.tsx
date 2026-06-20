import { useCallback, useEffect, useState } from 'react';
import { searchChannels } from '../api/channels';
import { CategoryHoneycomb } from '../components/CategoryHoneycomb';
import { ChannelList } from '../components/ChannelList';
import { SearchBar } from '../components/SearchBar';
import { useCategories } from '../hooks/useCategories';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { hapticSuccess, notifyUser, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';

export function SearchPage() {
  const { webApp, isLocalBrowser } = useTelegram();
  const { searchCategories, loading: categoriesLoading } = useCategories();
  const { recommendedIds, load: loadRecommended, recommend } = useMyRecommendations();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [step, setStep] = useState<'category' | 'results'>('category');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [query, setQuery] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchChannels = useCallback(async () => {
    if (!selectedCategory) return;
    setIsLoading(true);
    try {
      const result = await searchChannels({
        q: query.trim() || undefined,
        category: selectedCategory === 'all' ? undefined : selectedCategory,
      });
      setChannels(result.items);
    } catch {
      notify('검색 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [query, selectedCategory]);

  useEffect(() => {
    if (step === 'results') fetchChannels();
  }, [step, fetchChannels]);

  const handleCategorySelect = (categoryId: string) => {
    if (!categoryId) return;
    setSelectedCategory(categoryId);
    setQuery('');
    setStep('results');
  };

  const handleBack = () => {
    setStep('category');
    setSelectedCategory('');
    setQuery('');
    setChannels([]);
  };

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

  const categoryLabel = searchCategories.find((c) => c.id === selectedCategory)?.label ?? '';

  if (step === 'category') {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] flex-col">
        <header className="flex items-center gap-1.5 bg-tg-bg px-4 pb-1 pt-5">
          <h1 className="text-[22px] font-bold tracking-tight text-tg-text">Search</h1>
        </header>
        {categoriesLoading ? (
          <div className="flex flex-1 items-center justify-center bg-white">
            <div className="h-16 w-16 animate-pulse rounded-full bg-tg-secondary" />
          </div>
        ) : (
          <CategoryHoneycomb categories={searchCategories} onSelect={handleCategorySelect} />
        )}
      </div>
    );
  }

  return (
    <>
      <header className="flex items-center gap-2 px-4 pb-1 pt-4">
        <button type="button" onClick={handleBack} className="rounded-full bg-tg-secondary px-3 py-1.5 text-sm text-tg-text">←</button>
        <h1 className="truncate text-[20px] font-bold text-tg-text">{categoryLabel}</h1>
      </header>
      <SearchBar value={query} onChange={setQuery} onSearch={fetchChannels} isLoading={isLoading} />
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