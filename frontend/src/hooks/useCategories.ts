import { useEffect, useState } from 'react';
import { getCategories } from '../api/categories';
import type { CategoryItem } from '../types/categoryItem';

export function useCategories() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
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