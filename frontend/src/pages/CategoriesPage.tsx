import { useMemo, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getRankingCategories } from '../api/ranking';
import { useRankingInfiniteList } from '../hooks/useRankingInfiniteList';
import { useRankAds } from '../hooks/useRankAds';
import { mergeRankAds } from '../utils/mergeRankAds';
import { AdultConfirmDialog, hasConfirmedAdult } from '../components/AdultConfirmDialog';
import { RankingCategoryPicker } from '../components/RankingCategoryPicker';
import { RankingChannelCard } from '../components/RankingChannelCard';
import type { RankingCategoryItem } from '../types/ranking';
import type { RankingSort } from '../types/stats';
import { resolveMediaUrl } from '../utils/mediaUrl';

const SORT_CHIPS: { id: RankingSort; label: string }[] = [
  { id: 'members', label: '회원 수' },
  { id: 'score', label: '종합' },
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
  // 기본: 회원 많은 순
  return 'members';
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
  const [categoriesLoading, setCategoriesLoading] = useState(true);
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

  const listCategory = category === '성인' && !hasConfirmedAdult() ? 'all' : category;
  const { channels, isLoading, loadingMore, error, sentinelRef } = useRankingInfiniteList({
    category: listCategory,
    sort,
    type,
  });
  const rankAds = useRankAds(listCategory, type);
  const rows = useMemo(() => mergeRankAds(channels, rankAds), [channels, rankAds]);

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col">
      <header className="bg-tg-bg pt-5">
        <h1 className="px-4 text-[22px] font-bold tracking-tight text-tg-text">카테고리</h1>
      </header>

      {categoriesLoading ? (
        <div className="border-b border-nl-line bg-tg-bg px-4 py-3">
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
            patchParams({ category: id, sort: 'members' });
          }}
        />
      )}

      <div className="px-4 pt-3">
        <div className="flex rounded-full bg-black/[0.05] p-0.5 dark:bg-white/[0.05]">
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
                  active ? 'bg-nl-card text-tg-text shadow-sm ring-1 ring-nl-line dark:bg-nl-elev dark:ring-white/10' : 'text-tg-hint'
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
          patchParams({ category: '성인', sort: 'members' });
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
                active ? 'bg-nl-accent/15 text-nl-accent ring-1 ring-nl-accent/30' : 'bg-tg-secondary text-tg-hint'
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
          <div className="flex flex-col gap-3 px-4 pt-1 pb-6">
            {rows.map((row) => (
              <RankingChannelCard
                key={row.adId ? `ad-${row.adId}` : row.channel.id}
                rank={row.rank}
                adId={row.adId}
                channel={row.channel}
                avatarUrl={resolveMediaUrl(row.channel.avatarUrl)}
                onOpen={() => undefined}
              />
            ))}
            {loadingMore && (
              <p className="px-4 py-3 text-center text-xs text-tg-hint">더 불러오는 중...</p>
            )}
            <div ref={sentinelRef} className="h-4" />
          </div>
        )}
      </div>
    </div>
  );
}
