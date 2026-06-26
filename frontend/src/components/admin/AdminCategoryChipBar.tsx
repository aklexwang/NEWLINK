import { CategoryIcon } from '../CategoryIcon';
import type { CategoryItem } from '../../types/categoryItem';

interface AdminCategoryChipBarProps {
  categories: CategoryItem[];
  selected: string;
  onSelect: (name: string) => void;
  counts?: Record<string, number>;
}

export function AdminCategoryChipBar({
  categories,
  selected,
  onSelect,
  counts,
}: AdminCategoryChipBarProps) {
  const chipClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-50'
    }`;

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">카테고리</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onSelect('')} className={chipClass(selected === '')}>
          전체
          {counts?.[''] !== undefined && (
            <span className={`text-xs ${selected === '' ? 'text-white/80' : 'text-slate-400'}`}>
              {counts['']}
            </span>
          )}
        </button>
        {categories.map((category) => {
          const active = selected === category.name;
          const count = counts?.[category.name];
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.name)}
              className={chipClass(active)}
            >
              <CategoryIcon emoji={category.emoji} iconUrl={category.iconUrl} size="sm" className="!h-5 !w-5 !text-sm" />
              <span>{category.name}</span>
              {count !== undefined && (
                <span className={`text-xs ${active ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
