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

  // 방이 있는 카테고리만, 방 많은 순 (전체는 맨 앞, 지금 고른 건 0개여도 보이게)
  const ordered = useMemo(() => {
    const all = categories.filter((c) => c.id === 'all');
    const rest = categories
      .filter((c) => c.id !== 'all' && (c.count > 0 || c.id === selected))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko'));
    return [...all, ...rest];
  }, [categories, selected]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return ordered;
    return ordered.filter((category) => category.name.toLowerCase().includes(keyword));
  }, [ordered, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    close();
  };

  if (!selectedCategory) return null;

  return (
    <div className="relative z-30 bg-tg-bg px-4 py-3">
      {/* 지금 보는 카테고리 한 줄 + 오른쪽 [카테고리 바꾸기]로 목록 열기 */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl bg-nl-card px-3.5 py-3 text-left ring-1 ring-nl-line active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-nl-elev">
          <CategoryIcon emoji={selectedCategory.emoji} iconUrl={selectedCategory.iconUrl} size="sm" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] leading-tight font-bold text-tg-text">
            {selectedCategory.name}
          </span>
          <span className="mt-0.5 block text-[12px] text-tg-hint">
            방 {selectedCategory.count.toLocaleString()}개
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#229af0] px-3.5 py-2 text-[13px] font-bold text-white">
          카테고리
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="닫기"
            className="fixed inset-0 z-40 bg-black/25"
            onClick={close}
          />
          <div className="absolute inset-x-4 top-[calc(100%+4px)] z-50 flex max-h-[min(70dvh,520px)] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-tg-bg shadow-2xl animate-[dropdown-down_0.2s_ease-out]">
            <div className="border-b border-black/[0.06] px-4 py-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="카테고리 검색"
                className="w-full rounded-xl bg-tg-secondary px-4 py-2.5 text-sm text-tg-text outline-none ring-1 ring-black/10 focus:ring-tg-link/40"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-tg-hint">검색 결과가 없습니다.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2.5">
                  {filtered.map((category) => {
                    const active = category.id === selected;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => handleSelect(category.id)}
                        className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-3 text-center transition active:scale-[0.98] ${
                          active
                            ? 'border-nl-accent/40 bg-nl-accent/15'
                            : 'border-nl-line bg-tg-secondary'
                        }`}
                      >
                        <CategoryIcon emoji={category.emoji} iconUrl={category.iconUrl} size="md" />
                        <div className="min-w-0 w-full">
                          <p
                            className={`truncate text-xs font-semibold ${
                              active ? 'text-nl-accent' : 'text-tg-text'
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
        </>
      )}
    </div>
  );
}
