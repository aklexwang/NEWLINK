import { useEffect, useState } from 'react';
import { getCategories } from '../api/categories';
import { getRankingCounts } from '../api/ranking';
import type { CategoryItem } from '../types/categoryItem';

let cachedCategories: CategoryItem[] | null = null;
let inflight: Promise<CategoryItem[]> | null = null;

function loadCategories(): Promise<CategoryItem[]> {
  if (cachedCategories) return Promise.resolve(cachedCategories);
  if (inflight) return inflight;
  inflight = getCategories()
    .then((items) => {
      cachedCategories = items;
      return items;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

// 카테고리별 방 수 (회원 화면 목록을 "방 많은 순"으로 보여 주려고)
let cachedCounts: Record<string, number> | null = null;
let countsInflight: Promise<Record<string, number>> | null = null;

function loadCounts(): Promise<Record<string, number>> {
  if (cachedCounts) return Promise.resolve(cachedCounts);
  if (countsInflight) return countsInflight;
  countsInflight = getRankingCounts()
    .then((counts) => {
      cachedCounts = counts;
      return counts;
    })
    .catch(() => ({}) as Record<string, number>)
    .finally(() => {
      countsInflight = null;
    });
  return countsInflight;
}

/** 방 많은 순, 같으면 원래 순서 */
export function sortByRoomCount<T extends { name: string }>(items: T[], counts: Record<string, number>): T[] {
  return items
    .map((item, index) => ({ item, index, n: counts[item.name] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.index - b.index)
    .map((row) => row.item);
}

export function useCategories() {
  const [counts, setCounts] = useState<Record<string, number>>(cachedCounts ?? {});
  useEffect(() => {
    let cancelled = false;
    void loadCounts().then((c) => {
      if (!cancelled) setCounts(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [categories, setCategories] = useState<CategoryItem[]>(cachedCategories ?? []);
  const [loading, setLoading] = useState(!cachedCategories);

  useEffect(() => {
    let cancelled = false;
    if (cachedCategories) {
      setCategories(cachedCategories);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadCategories()
      .then((items) => {
        if (!cancelled) setCategories(items);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const searchCategories = [
    { id: 'all', label: '전체', emoji: '🔎', iconUrl: null as string | null },
    ...sortByRoomCount(categories, counts).map((c) => ({
      id: c.name,
      label: c.name,
      emoji: c.emoji,
      iconUrl: c.iconUrl ?? null,
    })),
  ];

  const submitCategories = sortByRoomCount(categories, counts).map((c) => c.name);

  return { categories, searchCategories, submitCategories, loading };
}
