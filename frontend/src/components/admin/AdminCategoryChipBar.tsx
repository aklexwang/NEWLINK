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

  const totalCount = counts?.[''];
  const selectedCount = selected ? counts?.[selected] : totalCount;
  const selectedLabel = selected || '전체';

  return (
    <div className="mb-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">카테고리</p>
        {counts && (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{selectedLabel}</span>
            <span className="mx-1.5 text-slate-300">·</span>
            연결된 링크{' '}
            <span className="font-semibold tabular-nums text-slate-900">{selectedCount ?? 0}</span>개
            {totalCount !== undefined && selected && (
              <span className="ml-1.5 text-xs text-slate-400">(전체 {totalCount}개)</span>
            )}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onSelect('')} className={chipClass(selected === '')}>
          전체
          {counts?.[''] !== undefined && (
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${selected === '' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
              {counts['']}
            </span>
          )}
        </button>
        {categories.map((category) => {
          const active = selected === category.name;
          const count = counts?.[category.name] ?? 0;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.name)}
              className={chipClass(active)}
            >
              <CategoryIcon emoji={category.emoji} iconUrl={category.iconUrl} size="sm" className="!h-5 !w-5 !text-sm" />
              <span>{category.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
