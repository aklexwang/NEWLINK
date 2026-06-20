import { CategoryIcon } from './CategoryIcon';

interface CategoryChip {
  id: string;
  label: string;
  emoji: string;
  iconUrl?: string | null;
}

interface CategoryChipsProps {
  categories: CategoryChip[];
  selected: string;
  onSelect: (id: string) => void;
}

export function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  return (
    <div className="-mx-4 overflow-x-auto scrollbar-none scroll-smooth">
      <div className="flex w-max gap-2.5 px-4 py-3">
        {categories.map((cat) => {
          const active = (cat.id === 'all' && !selected) || selected === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id === 'all' ? '' : cat.id)}
              className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-sm font-medium shadow-sm transition active:scale-[0.98] ${
                active
                  ? 'border-tg-link/30 bg-tg-open-bg text-tg-link'
                  : 'border-black/[0.06] bg-white text-tg-text'
              }`}
            >
              <CategoryIcon emoji={cat.emoji} iconUrl={cat.iconUrl} size="sm" className="bg-transparent ring-0" />
              <span>{cat.label}</span>
            </button>
          );
        })}
        <div className="shrink-0 w-4" aria-hidden />
      </div>
    </div>
  );
}