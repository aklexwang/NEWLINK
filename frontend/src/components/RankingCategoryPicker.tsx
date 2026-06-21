import { useMemo, useState } from 'react';
import type { RankingCategoryItem } from '../types/ranking';
import { CategoryIcon } from './CategoryIcon';

interface RankingCategoryPickerProps {
  categories: RankingCategoryItem[];
  selected: string;
  onSelect: (id: string) => void;
}

export function RankingCategoryPicker({
  categories,
  selected,
  onSelect,
}: RankingCategoryPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedCategory =
    categories.find((category) => category.id === selected) ?? categories[0];

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return categories;
    return categories.filter((category) => category.name.toLowerCase().includes(keyword));
  }, [categories, query]);

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQuery('');
  };

  if (!selectedCategory) return null;

  return (
    <>
      <div className="border-b border-black/[0.06] bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-black/[0.06] bg-tg-bg px-3.5 py-3 text-left active:scale-[0.99]"
        >
          <CategoryIcon emoji={selectedCategory.emoji} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-tg-hint">카테고리</p>
            <p className="truncate text-[15px] font-semibold text-tg-text">
              {selectedCategory.name}
              {selectedCategory.id !== 'all' && (
                <span className="ml-1 text-[13px] font-normal text-tg-hint">
                  · {selectedCategory.count}개
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-tg-open-bg px-3 py-1.5 text-xs font-medium text-tg-link">
            변경
          </span>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 mx-auto max-w-lg">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setOpen(false);
              setQuery('');
            }}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[78dvh] flex-col rounded-t-3xl bg-tg-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
              <p className="text-[17px] font-bold text-tg-text">카테고리 선택</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQuery('');
                }}
                className="rounded-full bg-tg-secondary px-3 py-1.5 text-sm text-tg-text"
              >
                닫기
              </button>
            </div>

            <div className="px-4 py-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="카테고리 검색"
                className="w-full rounded-xl bg-white px-4 py-2.5 text-sm outline-none ring-1 ring-black/10 focus:ring-tg-link/40"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-tg-hint">검색 결과가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2.5 pb-2">
                  {filtered.map((category) => {
                    const active = category.id === selected;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => handleSelect(category.id)}
                        className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition active:scale-[0.98] ${
                          active
                            ? 'border-tg-link/30 bg-tg-open-bg'
                            : 'border-black/[0.06] bg-white'
                        }`}
                      >
                        <CategoryIcon emoji={category.emoji} size="md" />
                        <div className="min-w-0 w-full">
                          <p
                            className={`truncate text-xs font-semibold ${
                              active ? 'text-tg-link' : 'text-tg-text'
                            }`}
                          >
                            {category.name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-tg-hint">{category.count}개</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
