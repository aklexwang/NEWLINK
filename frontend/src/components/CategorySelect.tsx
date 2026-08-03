import { useMemo, useState } from 'react';
import { CategoryIcon } from './CategoryIcon';

interface CategoryOption {
  id: string;
  label: string;
  emoji: string;
  iconUrl?: string | null;
}

interface CategorySelectProps {
  categories: CategoryOption[];
  selected: string;
  onSelect: (id: string) => void;
}

export function CategorySelect({ categories, selected, onSelect }: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedCategory =
    categories.find((cat) => (cat.id === 'all' ? !selected : cat.id === selected)) ??
    categories.find((cat) => cat.id === 'all') ??
    categories[0];

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return categories;
    return categories.filter((cat) => cat.label.toLowerCase().includes(keyword));
  }, [categories, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const handleSelect = (id: string) => {
    onSelect(id === 'all' ? '' : id);
    close();
  };

  if (!selectedCategory) return null;

  return (
    <div className="relative z-30 border-b border-black/[0.06] bg-white px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl border border-black/[0.06] bg-tg-bg px-3.5 py-3 text-left active:scale-[0.99]"
      >
        <CategoryIcon emoji={selectedCategory.emoji} iconUrl={selectedCategory.iconUrl} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-tg-hint">카테고리</p>
          <p className="truncate text-[15px] font-semibold text-tg-text">{selectedCategory.label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full bg-tg-open-bg px-3 py-1.5 text-xs font-medium text-tg-link transition-transform ${open ? 'rotate-180' : ''}`}
        >
          ▼
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
                className="w-full rounded-xl bg-tg-secondary px-3 py-2.5 text-sm outline-none"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto overscroll-contain p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-tg-hint">검색 결과가 없습니다.</p>
              ) : (
                filtered.map((cat) => {
                  const active = (cat.id === 'all' && !selected) || selected === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelect(cat.id)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        active ? 'bg-tg-open-bg text-tg-link' : 'text-tg-text hover:bg-tg-secondary/80'
                      }`}
                    >
                      <CategoryIcon emoji={cat.emoji} iconUrl={cat.iconUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{cat.label}</span>
                      {active && <span className="text-xs font-semibold">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
