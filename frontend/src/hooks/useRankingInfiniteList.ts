import { useCallback, useEffect, useRef, useState } from 'react';
import { getRankingChannels } from '../api/ranking';
import type { RankingChannel } from '../types/ranking';
import type { RankingSort } from '../types/stats';

const PAGE_SIZE = 50;

export function useRankingInfiniteList(input: {
  category: string;
  sort?: RankingSort;
  type?: 'channel' | 'group';
  hideLowData?: boolean;
  verifiedOnly?: boolean;
  includeForeign?: boolean;
}) {
  const [channels, setChannels] = useState<RankingChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { category, sort, type, hideLowData, verifiedOnly, includeForeign } = input;

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setIsLoading(true);
      setError('');
      try {
        const items = await getRankingChannels(category, PAGE_SIZE, {
          sort,
          type,
          hideLowData,
          verifiedOnly,
          includeForeign,
          offset,
        });
        setChannels((prev) => {
          if (!append) return items;
          const seen = new Set(prev.map((row) => row.id));
          return [...prev, ...items.filter((row) => !seen.has(row.id))];
        });
        setHasMore(items.length >= PAGE_SIZE);
        if (!append && items.length === 0) {
          setError('이 조건에 맞는 채널·그룹이 없습니다.');
        }
      } catch {
        if (!append) {
          setChannels([]);
          setError('목록을 불러오지 못했습니다.');
        }
        setHasMore(false);
      } finally {
        setIsLoading(false);
        setLoadingMore(false);
      }
    },
    [category, sort, type, hideLowData, verifiedOnly, includeForeign],
  );

  useEffect(() => {
    setChannels([]);
    setHasMore(true);
    void fetchPage(0, false);
  }, [fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || isLoading || loadingMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchPage(channels.length, true);
        }
      },
      { rootMargin: '160px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [channels.length, fetchPage, hasMore, isLoading, loadingMore]);

  return { channels, isLoading, loadingMore, hasMore, error, sentinelRef };
}
