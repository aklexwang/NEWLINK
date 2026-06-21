import { useCallback, useEffect, useState } from 'react';
import { getRankingCategories, getRankingChannels, getRankingStatus } from '../api/ranking';
import { RankingCategoryPicker } from '../components/RankingCategoryPicker';
import { RankingChannelCard } from '../components/RankingChannelCard';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import type { RankingCategoryItem, RankingChannel } from '../types/ranking';
import { resolveMediaUrl } from '../utils/mediaUrl';

export function RankingPage() {
  const { webApp, isLocalBrowser } = useTelegram();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<RankingCategoryItem[]>([]);
  const [channels, setChannels] = useState<RankingChannel[]>([]);
  const [sourceLabel, setSourceLabel] = useState('텔레그램 인기 채널 · 구독자 순');
  const [sourceHint, setSourceHint] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setCategoriesLoading(true);
    Promise.all([getRankingStatus(), getRankingCategories()])
      .then(([status, items]) => {
        setSourceLabel(status.label);
        setSourceHint(status.hint ?? '');
        setCategories(items);
      })
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const fetchRanking = useCallback(async (category: string) => {
    setIsLoading(true);
    setError('');
    try {
      const items = await getRankingChannels(category, 50);
      setChannels(items);
      if (items.length === 0) {
        setError('이 카테고리에서 불러온 텔레그램 채널이 없습니다.');
      }
    } catch (err: unknown) {
      setChannels([]);
      const message =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'message' in err.response.data
          ? String(err.response.data.message)
          : '랭킹을 불러오지 못했습니다. 백엔드(localhost:3000)가 실행 중인지 확인해 주세요.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (categoriesLoading) return;
    void fetchRanking(selectedCategory);
  }, [selectedCategory, fetchRanking, categoriesLoading]);

  const selectedLabel =
    categories.find((category) => category.id === selectedCategory)?.name ?? '전체';

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col">
      <header className="bg-tg-bg px-4 pb-2 pt-5">
        <h1 className="text-[22px] font-bold tracking-tight text-tg-text">랭킹</h1>
        <p className="mt-1 text-[13px] text-tg-hint">{sourceLabel}</p>
        {sourceHint && <p className="mt-1 text-[11px] leading-snug text-tg-hint/80">{sourceHint}</p>}
      </header>

      {categoriesLoading ? (
        <div className="border-b border-black/[0.06] bg-white px-4 py-3">
          <div className="h-16 animate-pulse rounded-2xl bg-tg-secondary" />
        </div>
      ) : categories.length === 0 ? (
        <p className="px-4 py-3 text-sm text-tg-hint">
          랭킹 카테고리가 없습니다. backend/data/ranking-seeds.json 을 확인해 주세요.
        </p>
      ) : (
        <RankingCategoryPicker
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      )}

      <div className="min-h-0 flex-1 bg-tg-bg">
        <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-tg-bg/95 px-4 py-2 backdrop-blur-md">
          <p className="text-sm font-semibold text-tg-text">{selectedLabel} 랭킹</p>
          <p className="text-[11px] text-tg-hint">텔레그램 구독자 수 기준</p>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8">
            <div className="flex w-full flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-tg-secondary" />
              ))}
            </div>
            <p className="text-xs text-tg-hint">텔레그램에서 구독자 수를 불러오는 중...</p>
          </div>
        ) : error ? (
          <p className="px-4 py-8 text-center text-sm text-tg-hint">{error}</p>
        ) : (
          <div className="divide-y divide-black/[0.06] pb-4">
            {channels.map((channel, index) => (
              <RankingChannelCard
                key={channel.id}
                rank={index + 1}
                title={channel.title}
                avatarUrl={resolveMediaUrl(channel.avatarUrl)}
                participantsCount={channel.participantsCount}
                recommendCount={channel.recommendCount}
                linkType={channel.linkType}
                username={channel.username}
                onOpen={() => openTelegramChannel(webApp, isLocalBrowser, channel.link)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
