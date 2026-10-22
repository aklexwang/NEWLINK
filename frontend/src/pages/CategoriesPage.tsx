import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getRankingCategories, getRankingChannels } from '../api/ranking';
import { AdultConfirmDialog, hasConfirmedAdult } from '../components/AdultConfirmDialog';
import { RankingCategoryPicker } from '../components/RankingCategoryPicker';
import { RankingChannelCard } from '../components/RankingChannelCard';
import type { RankingCategoryItem, RankingChannel } from '../types/ranking';
import type { RankingSort } from '../types/stats';
import { resolveMediaUrl } from '../utils/mediaUrl';

const SORT_CHIPS: { id: RankingSort; label: string }[] = [
  { id: 'score', label: '종합' },
  { id: 'members', label: '구독자' },
  { id: 'viewRate', label: '조회율' },
  { id: 'rising', label: '급상승' },
  { id: 'growth24h', label: '24시간' },
  { id: 'growth7d', label: '7일' },
  { id: 'growth30d', label: '30일' },
  { id: 'activity', label: '활동' },
  { id: 'newest', label: '신규' },
];

const SORT_IDS = new Set(SORT_CHIPS.map((c) => c.id));

function parseSort(raw: string | null): RankingSort {
  if (raw && SORT_IDS.has(raw as RankingSort)) return raw as RankingSort;
  return 'score';
}

function parseType(raw: string | null): 'channel' | 'group' | undefined {
  if (raw === 'channel' || raw === 'group') return raw;
  return undefined;
}

export function CategoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = parseSort(searchParams.get('sort'));
  const type = parseType(searchParams.get('type'));
  const category = searchParams.get('category') || 'all';

  const [categories, setCategories] = useState<RankingCategoryItem[]>([]);
  const [channels, setChannels] = useState<RankingChannel[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [adultOpen, setAdultOpen] = useState(
    () => (searchParams.get('category') || '') === '성인' && !hasConfirmedAdult(),
  );

  const patchParams = useCallback(
    (patch: { sort?: RankingSort; type?: 'channel' | 'group' | ''; category?: string }) => {
      const next = new URLSearchParams(searchParams);
      if (patch.sort) next.set('sort', patch.sort);
      if (patch.category !== undefined) {
        if (!patch.category || patch.category === 'all') next.delete('category');
        else next.set('category', patch.category);
      }
      if (patch.type !== undefined) {
        if (!patch.type) next.delete('type');
        else next.set('type', patch.type);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    setCategoriesLoading(true);
    getRankingCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setCategoriesLoading(false));
  }, []);

  const fetchList = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const listCategory = category === '성인' && !hasConfirmedAdult() ? 'all' : category;
      const items = await getRankingChannels(listCategory, 50, { sort, type });
      setChannels(items);
      if (items.length === 0) {
        setError('이 조건에 맞는 채널·그룹이 없습니다.');
      }
    } catch {
      setChannels([]);
      setError('목록을 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [category, sort, type]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col">
      <header className="bg-tg-bg pt-5">
        <h1 className="px-4 text-[22px] font-bold tracking-tight text-tg-text">카테고리</h1>
      </header>

      {categoriesLoading ? (
        <div className="border-b border-black/[0.06] bg-white px-4 py-3 dark:bg-nl-card">
          <div className="h-16 animate-pulse rounded-2xl bg-tg-secondary" />
        </div>
      ) : categories.length === 0 ? (
        <p className="px-4 py-3 text-sm text-tg-hint">표시할 카테고리가 없습니다.</p>
      ) : (
        <RankingCategoryPicker
          categories={categories}
          selected={category}
          onSelect={(id) => {
            if (id === '성인' && !hasConfirmedAdult()) {
              setAdultOpen(true);
              return;
            }
            patchParams({ category: id });
          }}
        />
      )}

      <div className="px-4 pt-3">
        <div className="flex rounded-full bg-tg-secondary p-0.5">
          {(
            [
              { id: '', label: '전체' },
              { id: 'channel', label: '채널' },
              { id: 'group', label: '그룹' },
            ] as const
          ).map((item) => {
            const active = (type ?? '') === item.id;
            return (
              <button
                key={item.id || 'all'}
                type="button"
                onClick={() => patchParams({ type: item.id })}
                className={`flex-1 rounded-full py-1.5 text-[13px] font-semibold ${
                  active ? 'bg-white text-tg-text shadow-sm dark:bg-nl-elev' : 'text-tg-hint'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <AdultConfirmDialog
        open={adultOpen}
        onCancel={() => setAdultOpen(false)}
        onConfirm={() => {
          setAdultOpen(false);
          patchParams({ category: '성인' });
        }}
      />

      <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 py-2">
        {SORT_CHIPS.map((chip) => {
          const active = sort === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => patchParams({ sort: chip.id })}
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${
                active ? 'bg-tg-open-bg text-tg-open-text' : 'bg-tg-secondary text-tg-hint'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 bg-tg-bg">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8">
            <div className="flex w-full flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-tg-secondary" />
              ))}
            </div>
            <p className="text-xs text-tg-hint">목록을 불러오는 중...</p>
          </div>
        ) : error ? (
          <p className="px-4 py-8 text-center text-sm text-tg-hint">{error}</p>
        ) : (
          <div className="divide-y divide-black/[0.06] pb-4 dark:divide-white/10">
            {channels.map((channel, index) => (
              <RankingChannelCard
                key={channel.id}
                rank={index + 1}
                channel={channel}
                avatarUrl={resolveMediaUrl(channel.avatarUrl)}
                onOpen={() => undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
