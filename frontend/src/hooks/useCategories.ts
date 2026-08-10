import { useEffect, useState } from 'react';
import { getCategories } from '../api/categories';
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

export function useCategories() {
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
    ...categories.map((c) => ({
      id: c.name,
      label: c.name,
      emoji: c.emoji,
      iconUrl: c.iconUrl ?? null,
    })),
  ];

  const submitCategories = categories.map((c) => c.name);

  return { categories, searchCategories, submitCategories, loading };
}
