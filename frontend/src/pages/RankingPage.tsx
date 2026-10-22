import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getRankingCategories, getRankingChannels, getRankingStatus } from '../api/ranking';
import { RankingCategoryPicker } from '../components/RankingCategoryPicker';
import { RankingChannelCard } from '../components/RankingChannelCard';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
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

export function RankingPage() {
  const { webApp, isLocalBrowser } = useTelegram();
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = parseSort(searchParams.get('sort'));
  const type = parseType(searchParams.get('type'));
  const category = searchParams.get('category') || 'all';
  const hideLowData =
    searchParams.get('hideLowData') === '1' || searchParams.get('hideLowData') === 'true';
  const verifiedOnly =
    searchParams.get('verified') === '1' || searchParams.get('verifiedOnly') === '1';
  const includeForeign =
    searchParams.get('includeForeign') === '1' ||
    searchParams.get('includeForeign') === 'true';

  const [categories, setCategories] = useState<RankingCategoryItem[]>([]);
  const [channels, setChannels] = useState<RankingChannel[]>([]);
  const [sourceLabel, setSourceLabel] = useState('텔레그램 인기 채널 · 구독자 순');
  const [sourceHint, setSourceHint] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const patchParams = useCallback(
    (patch: {
      sort?: RankingSort;
      type?: 'channel' | 'group' | '';
      category?: string;
      hideLowData?: boolean;
      verifiedOnly?: boolean;
      includeForeign?: boolean;
    }) => {
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
      if (patch.hideLowData !== undefined) {
        if (patch.hideLowData) next.set('hideLowData', '1');
        else next.delete('hideLowData');
      }
      if (patch.verifiedOnly !== undefined) {
        if (patch.verifiedOnly) next.set('verified', '1');
        else next.delete('verified');
      }
      if (patch.includeForeign !== undefined) {
        if (patch.includeForeign) next.set('includeForeign', '1');
        else next.delete('includeForeign');
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    if (!searchParams.get('sort')) {
      const next = new URLSearchParams(searchParams);
      next.set('sort', 'score');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const fetchRanking = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const items = await getRankingChannels(category, 50, {
        sort,
        type,
        hideLowData,
        verifiedOnly,
        includeForeign,
      });
      setChannels(items);
      if (items.length === 0) {
        setError('이 조건에 맞는 채널·그룹이 없습니다.');
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
  }, [category, sort, type, hideLowData, verifiedOnly, includeForeign]);

  useEffect(() => {
    void fetchRanking();
  }, [fetchRanking]);

  const selectedLabel = useMemo(
    () => categories.find((item) => item.id === category)?.name ?? '전체',
    [categories, category],
  );

  const sortLabel = SORT_CHIPS.find((c) => c.id === sort)?.label ?? '종합';

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col">
      <header className="bg-tg-bg px-4 pb-2 pt-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-[22px] font-bold tracking-tight text-tg-text">랭킹</h1>
            <p className="mt-1 text-[13px] text-tg-hint">{sourceLabel}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Link
              to="/weekly"
              className="rounded-full bg-tg-secondary px-2.5 py-1.5 text-[11px] font-semibold text-tg-text"
            >
              주간 변화
            </Link>
            <Link
              to="/compare"
              className="rounded-full bg-tg-open-bg px-2.5 py-1.5 text-[11px] font-semibold text-tg-open-text"
            >
              비교
            </Link>
          </div>
        </div>
        {sourceHint && <p className="mt-1 text-[11px] leading-snug text-tg-hint/80">{sourceHint}</p>}

        <div className="mt-3 flex rounded-full bg-tg-secondary p-0.5">
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
                  active ? 'bg-white text-tg-text shadow-sm' : 'text-tg-hint'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      {categoriesLoading ? (
        <div className="border-b border-black/[0.06] bg-white px-4 py-3">
          <div className="h-16 animate-pulse rounded-2xl bg-tg-secondary" />
        </div>
      ) : categories.length === 0 ? (
        <p className="px-4 py-3 text-sm text-tg-hint">
          표시할 랭킹이 없습니다. 어드민에서 채널·그룹을 등록해 주세요.
        </p>
      ) : (
        <RankingCategoryPicker
          categories={categories}
          selected={category}
          onSelect={(id) => patchParams({ category: id })}
        />
      )}

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

      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2">
        <label className="flex items-center gap-2 text-[13px] text-tg-text">
          <input
            type="checkbox"
            checked={hideLowData}
            onChange={(e) => patchParams({ hideLowData: e.target.checked })}
            className="h-4 w-4 accent-[#2481cc]"
          />
          데이터 부족 숨기기
        </label>
        <label className="flex items-center gap-2 text-[13px] text-tg-text">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => patchParams({ verifiedOnly: e.target.checked })}
            className="h-4 w-4 accent-[#2481cc]"
          />
          인증 채널만
        </label>
        <label className="flex items-center gap-2 text-[13px] text-tg-text">
          <input
            type="checkbox"
            checked={includeForeign}
            onChange={(e) => patchParams({ includeForeign: e.target.checked })}
            className="h-4 w-4 accent-[#2481cc]"
          />
          외국어 채널 포함
        </label>
      </div>

      <div className="min-h-0 flex-1 bg-tg-bg">
        <div className="sticky top-0 z-10 border-b border-black/[0.06] bg-tg-bg/95 px-4 py-2 backdrop-blur-md">
          <p className="text-sm font-semibold text-tg-text">{selectedLabel} 랭킹</p>
          <p className="text-[11px] text-tg-hint">{sortLabel} 기준 · 14일 추이</p>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8">
            <div className="flex w-full flex-col gap-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-tg-secondary" />
              ))}
            </div>
            <p className="text-xs text-tg-hint">랭킹을 불러오는 중...</p>
          </div>
        ) : error ? (
          <p className="px-4 py-8 text-center text-sm text-tg-hint">{error}</p>
        ) : (
          <div className="divide-y divide-black/[0.06] pb-4">
            {channels.map((channel, index) => (
              <RankingChannelCard
                key={channel.id}
                rank={index + 1}
                channel={channel}
                avatarUrl={resolveMediaUrl(channel.avatarUrl)}
                onOpen={() => openTelegramChannel(webApp, isLocalBrowser, channel.link)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
